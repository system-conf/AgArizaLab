import type { Device } from '../../domain'
import { L3Interfaces } from '../../engine'
import { localizedMessage } from '../../i18n/messageKeys'
import type { OpenIssue } from './HandoverTypes'
import type { LabIndex } from './LabIndex'

type LabIssue = Extract<OpenIssue, { source: 'lab' }>

/**
 * Unfinished parts of any lab (no brief needed): devices off, unplugged cables, end devices without
 * a cable, an address or a gateway, DHCP clients nobody answers, duplicate addresses. Runs on the
 * settled lab (DhcpSettler), so a DHCP client without an address really gets none.
 */
export class LabIssueFinder {
  find(index: LabIndex): LabIssue[] {
    const issues: LabIssue[] = []
    const routed = index.state.devices.some((device) => L3Interfaces.isRouter(device))
    for (const device of index.state.devices) {
      const name = index.ref(device.id).deviceName
      if (!device.powered) issues.push(this.issue('deviceOff', device.id, localizedMessage('design:handover.issues.deviceOff', { device: name })))
      else if (device.host) issues.push(...this.hostIssues(index, device, name, routed))
    }
    for (const link of index.state.links) {
      if (link.connected) continue
      const a = index.ref(link.a.deviceId).deviceName
      const b = index.ref(link.b.deviceId).deviceName
      issues.push(this.issue('linkUnplugged', link.id, localizedMessage('design:handover.issues.linkUnplugged', { a, b })))
    }
    return [...issues, ...this.duplicates(index)]
  }

  private hostIssues(index: LabIndex, device: Device, name: string, routed: boolean): LabIssue[] {
    const cabled = new Set(index.cabledPorts(device))
    const nics = L3Interfaces.nics(device).filter((nic) => nic.portId !== undefined && cabled.has(nic.portId))
    if (nics.length === 0) return [this.issue('notCabled', device.id, localizedMessage('design:handover.issues.notCabled', { device: name }))]
    const issues: LabIssue[] = []
    for (const nic of nics) {
      if (L3Interfaces.isAddressed(nic)) continue
      issues.push(
        nic.addressing === 'dhcp'
          ? this.issue('dhcpNoAnswer', device.id, localizedMessage('design:handover.issues.dhcpNoAnswer', { device: name, interface: nic.id }))
          : this.issue('noAddress', device.id, localizedMessage('design:handover.issues.noAddress', { device: name, interface: nic.id })),
      )
    }
    const addressed = nics.some((nic) => L3Interfaces.isAddressed(nic))
    if (routed && addressed && device.host?.defaultGateway === '') {
      issues.push(this.issue('noGateway', device.id, localizedMessage('design:handover.issues.noGateway', { device: name })))
    }
    return issues
  }

  /** Addresses configured on more than one device, in order of first use. */
  private duplicates(index: LabIndex): LabIssue[] {
    const owners = new Map<string, string[]>()
    for (const device of index.state.devices) {
      const addresses = new Set(L3Interfaces.of(device).filter((iface) => L3Interfaces.isAddressed(iface)).map((iface) => iface.address))
      for (const address of addresses) owners.set(address, [...(owners.get(address) ?? []), device.id])
    }
    return [...owners.entries()]
      .filter(([, deviceIds]) => deviceIds.length > 1)
      .map(([address, deviceIds]) =>
        this.issue(
          'duplicateAddress',
          address,
          localizedMessage('design:handover.issues.duplicateAddress', { address, devices: deviceIds.map((id) => index.ref(id).deviceName).join(', ') }),
        ),
      )
  }

  private issue(code: LabIssue['code'], subjectId: string, message: LabIssue['message']): LabIssue {
    return { source: 'lab', code, subjectId, message }
  }
}
