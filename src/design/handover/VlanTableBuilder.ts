import type { Device, SwitchedPort } from '../../domain'
import { L3Interfaces } from '../../engine'
import type { DevicePorts, DeviceRef, SubnetRow, VlanRow } from './HandoverTypes'
import { LabIndex } from './LabIndex'

/**
 * The VLAN table: every VLAN of a VLAN database, a sub-interface / SVI, an SSID or a cabled access
 * port, with its names, subnets, cabled access ports and trunks per switch, addressed VLAN
 * interfaces (router sub-interfaces, SVIs) and SSIDs.
 */
export class VlanTableBuilder {
  build(index: LabIndex, ipPlan: readonly SubnetRow[]): VlanRow[] {
    const rows = new Map<number, VlanRow>()
    const row = (vlan: number): VlanRow => {
      let existing = rows.get(vlan)
      if (!existing) {
        existing = { vlan, names: [], subnets: [], accessPorts: [], trunkPorts: [], interfaces: [], ssids: [] }
        rows.set(vlan, existing)
      }
      return existing
    }
    for (const device of index.state.devices) {
      for (const entry of device.switching?.vlans ?? []) {
        const names = row(entry.id).names
        if (!names.includes(entry.name)) names.push(entry.name)
      }
      for (const iface of L3Interfaces.of(device)) {
        if ((iface.kind === 'subInterface' || iface.kind === 'svi') && iface.vlan !== undefined && L3Interfaces.isAddressed(iface)) {
          row(iface.vlan).interfaces.push({ ...index.ref(device.id), interfaceId: iface.id, address: iface.address })
        }
      }
      for (const entry of device.wireless?.ssids ?? []) row(entry.vlan).ssids.push({ ...index.ref(device.id), ssid: entry.ssid })
      this.addSwitchports(index, device, row)
    }
    for (const subnet of ipPlan) {
      for (const vlan of subnet.vlans) row(vlan).subnets.push(subnet.network)
    }
    return [...rows.values()].sort((a, b) => a.vlan - b.vlan)
  }

  private addSwitchports(index: LabIndex, device: Device, row: (vlan: number) => VlanRow): void {
    const cabled = new Set(index.cabledPorts(device))
    const access = new Map<number, string[]>()
    const trunk = new Map<number, string[]>()
    for (const port of device.ports) {
      if (port.role !== 'switched' || !cabled.has(port.id)) continue
      if (port.l2.mode === 'access') this.push(access, port.l2.accessVlan, port.id)
      else for (const vlan of this.trunkVlans(device, port)) this.push(trunk, vlan, port.id)
    }
    const ref: DeviceRef = index.ref(device.id)
    for (const [vlan, portIds] of access) row(vlan).accessPorts.push(this.ports(ref, portIds))
    for (const [vlan, portIds] of trunk) row(vlan).trunkPorts.push(this.ports(ref, portIds))
  }

  /** VLANs a trunk carries: allowed ∩ VLAN database (devices without a database: every listed VLAN). */
  private trunkVlans(device: Device, port: SwitchedPort): number[] {
    const database = device.switching?.vlans.map((entry) => entry.id)
    const allowed = port.l2.allowedVlans
    if (allowed === 'all') return database ?? []
    return database ? allowed.filter((vlan) => database.includes(vlan)) : [...allowed]
  }

  private push(map: Map<number, string[]>, vlan: number, portId: string): void {
    const list = map.get(vlan)
    if (list) list.push(portId)
    else map.set(vlan, [portId])
  }

  private ports(ref: DeviceRef, portIds: string[]): DevicePorts {
    return { ...ref, portIds: [...portIds].sort(LabIndex.comparePorts) }
  }
}
