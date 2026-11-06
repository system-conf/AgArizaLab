// Builds the explicit v2 ports of one v1 device, with their port-level settings, and records
// where every v1 link end lands (mapping table: docs/MODEL_V2.md §11).
import type { V1Device, V1Link, V1RouterInterface } from './v1Types'
import { MacAddress, type L3Settings, type Port, type PortMedium, type SubInterface } from '../../domain'
import { V1_HOST_KINDS } from './v1DeviceMap'

export const ROUTER_LAN_PORT = 'Gi0/0'
export const ROUTER_WAN_PORT = 'Gi0/1'
export const CONSOLE_PORT = 'Console'
export const AP_UPLINK_PORT = 'Gi0'
export const AP_RADIO_PORT = 'Radio0'
/** The cloud gets at least this many ports (eth0..eth3), one per v1 link beyond that. */
export const CLOUD_MIN_PORTS = 4

/** Ports of one migrated device and where its v1 link ends land. */
export interface PortPlan {
  ports: Port[]
  /** v2 port id of this device's end of `linkId` (v1 port id `v1PortId`). */
  portIdFor(linkId: string, v1PortId: string): string
}

/** One end of a v1 link on the device being migrated. */
interface V1End {
  linkId: string
  portId: string
  wireless: boolean
}

/** A port before MACs are assigned; `primary` keeps the v1 device MAC. */
interface DraftPort {
  port: Port
  primary: boolean
}

interface Draft {
  ports: DraftPort[]
  byV1Port: Map<string, string>
  byLink: Map<string, string>
}

function emptyL3(addressing: 'static' | 'dhcp'): L3Settings {
  return { ipv4: { addressing, address: '', mask: '' } }
}

function staticL3(address: string, mask: string): L3Settings {
  return { ipv4: { addressing: 'static', address, mask } }
}

function consolePort(): DraftPort {
  return { port: { id: CONSOLE_PORT, medium: 'console', role: 'console', adminUp: true }, primary: false }
}

export class V1PortMigrator {
  migrate(device: V1Device, links: readonly V1Link[]): PortPlan {
    const ends = this.endsOf(device.id, links)
    const draft = this.draftFor(device, ends)
    this.addUnknownPorts(device, ends, draft)
    const ports = this.assignMacs(device, draft.ports)
    return {
      ports,
      portIdFor: (linkId, v1PortId) => {
        const portId = draft.byLink.get(linkId) ?? draft.byV1Port.get(v1PortId)
        if (portId === undefined) throw new Error(`No v2 port for ${device.id}:${v1PortId} (link ${linkId})`)
        return portId
      },
    }
  }

  private endsOf(deviceId: string, links: readonly V1Link[]): V1End[] {
    const ends: V1End[] = []
    for (const link of links) {
      for (const end of [link.a, link.b]) {
        if (end.deviceId !== deviceId) continue
        const wireless = link.ssid !== undefined || end.portId === 'wlan0' || end.portId === 'radio'
        ends.push({ linkId: link.id, portId: end.portId, wireless })
      }
    }
    return ends
  }

  private draftFor(device: V1Device, ends: V1End[]): Draft {
    switch (device.kind) {
      case 'router':
        return this.routerDraft(device)
      case 'switch':
        return this.switchDraft(device)
      case 'accessPoint':
        return this.accessPointDraft()
      case 'internet':
        return this.cloudDraft(ends)
      default:
        return this.hostDraft(device, ends)
    }
  }

  /** v1 'lan' → Gi0/0 (VLAN-1 interface on the port, other VLANs as dot1Q sub-interfaces), 'wan' → Gi0/1. */
  private routerDraft(device: V1Device): Draft {
    const interfaces = device.routerInterfaces ?? []
    const native = interfaces.find((candidate) => candidate.vlan === 1)
    const lan: Port = {
      id: ROUTER_LAN_PORT,
      medium: 'copper',
      role: 'routed',
      adminUp: true,
      ...(native === undefined ? {} : { description: native.id }),
      l3: native === undefined ? emptyL3('static') : staticL3(native.ip, native.mask),
      subInterfaces: this.subInterfaces(interfaces.filter((candidate) => candidate !== native)),
    }
    const wan: Port = { id: ROUTER_WAN_PORT, medium: 'copper', role: 'routed', adminUp: true, l3: emptyL3('dhcp'), subInterfaces: [] }
    return {
      ports: [{ port: lan, primary: true }, { port: wan, primary: false }, consolePort()],
      byV1Port: new Map([
        ['lan', ROUTER_LAN_PORT],
        ['wan', ROUTER_WAN_PORT],
      ]),
      byLink: new Map(),
    }
  }

  /** Sub-interface number = VLAN id; on a clash (two interfaces in one VLAN) +1000 until free. */
  private subInterfaces(interfaces: V1RouterInterface[]): SubInterface[] {
    const used = new Set<number>()
    return interfaces.map((routerInterface) => {
      let number = routerInterface.vlan
      while (used.has(number)) number += 1000
      used.add(number)
      return {
        id: `${ROUTER_LAN_PORT}.${number}`,
        vlan: routerInterface.vlan,
        adminUp: true,
        description: routerInterface.id,
        l3: staticL3(routerInterface.ip, routerInterface.mask),
      }
    })
  }

  private switchDraft(device: V1Device): Draft {
    const ports: DraftPort[] = (device.switchPorts ?? []).map((switchPort) => ({
      port: {
        id: switchPort.id,
        medium: 'copper',
        role: 'switched',
        adminUp: switchPort.enabled,
        ...(switchPort.poe ? { poe: 'auto' as const } : {}),
        l2: { mode: switchPort.mode, accessVlan: switchPort.vlan, nativeVlan: 1, allowedVlans: 'all' },
      },
      primary: false,
    }))
    const byV1Port = new Map(ports.map((draft) => [draft.port.id, draft.port.id]))
    return { ports: [...ports, consolePort()], byV1Port, byLink: new Map() }
  }

  /** v1 'uplink' (carried every VLAN) → Gi0 as a trunk; v1 'radio' → Radio0. */
  private accessPointDraft(): Draft {
    const uplink: Port = {
      id: AP_UPLINK_PORT,
      medium: 'copper',
      role: 'switched',
      adminUp: true,
      l2: { mode: 'trunk', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' },
    }
    const radio: Port = { id: AP_RADIO_PORT, medium: 'wireless', role: 'radio', adminUp: true }
    return {
      ports: [{ port: uplink, primary: true }, { port: radio, primary: false }],
      byV1Port: new Map([
        ['uplink', AP_UPLINK_PORT],
        ['radio', AP_RADIO_PORT],
      ]),
      byLink: new Map(),
    }
  }

  /** One cloud port per v1 link (in link order), at least CLOUD_MIN_PORTS. */
  private cloudDraft(ends: V1End[]): Draft {
    const count = Math.max(CLOUD_MIN_PORTS, ends.length)
    const ports: DraftPort[] = []
    for (let index = 0; index < count; index += 1) {
      ports.push({ port: { id: `eth${index}`, medium: 'copper', role: 'passive', adminUp: true }, primary: index === 0 })
    }
    const byLink = new Map(ends.map((end, index) => [end.linkId, `eth${index}`]))
    return { ports, byV1Port: new Map(), byLink }
  }

  /**
   * eth0 (smartphones: wlan0) plus any of eth0 / wlan0 a v1 link uses. The v1 IP settings and MAC
   * go to the primary NIC: the first linked one (eth0 before wlan0), else the first NIC.
   */
  private hostDraft(device: V1Device, ends: V1End[]): Draft {
    const linked = new Set(ends.map((end) => end.portId))
    const nicIds = ['eth0', 'wlan0'].filter(
      (id) => linked.has(id) || (id === 'wlan0' ? device.kind === 'phone' : device.kind !== 'phone'),
    )
    const primaryId = nicIds.find((id) => linked.has(id)) ?? nicIds[0]
    const host = device.host
    const ports: DraftPort[] = nicIds.map((id) => {
      const primary = id === primaryId
      const l3: L3Settings =
        primary && host ? { ipv4: { addressing: host.mode, address: host.ip, mask: host.mask } } : emptyL3('dhcp')
      const medium: PortMedium = id === 'wlan0' ? 'wireless' : 'copper'
      return { port: { id, medium, role: 'host', adminUp: true, l3 }, primary }
    })
    return { ports, byV1Port: new Map(nicIds.map((id) => [id, id])), byLink: new Map() }
  }

  /**
   * A v1 link may name a port the v1 device did not have (v1 treated that end as dead). The port
   * is created with that id and `adminUp: false`, which keeps the link dead in v2.
   */
  private addUnknownPorts(device: V1Device, ends: V1End[], draft: Draft): void {
    for (const end of ends) {
      if (draft.byLink.has(end.linkId) || draft.byV1Port.has(end.portId)) continue
      if (!draft.ports.some((existing) => existing.port.id === end.portId)) {
        draft.ports.push({ port: this.deadPort(device, end), primary: false })
      }
      draft.byV1Port.set(end.portId, end.portId)
    }
  }

  private deadPort(device: V1Device, end: V1End): Port {
    const medium: PortMedium = end.wireless ? 'wireless' : 'copper'
    const base = { id: end.portId, medium, adminUp: false }
    if (device.kind === 'switch') {
      return { ...base, role: 'switched', l2: { mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' } }
    }
    if (device.kind === 'router') return { ...base, role: 'routed', l3: emptyL3('static'), subInterfaces: [] }
    if (V1_HOST_KINDS.includes(device.kind)) return { ...base, role: 'host', l3: emptyL3('dhcp') }
    return { ...base, role: 'passive' }
  }

  /** Primary port keeps the v1 MAC; other Ethernet / Wi-Fi ports get MacAddress.derive(mac, index + 1). */
  private assignMacs(device: V1Device, drafts: DraftPort[]): Port[] {
    return drafts.map((draft, index) => {
      if (draft.port.medium === 'console' || draft.port.medium === 'serial') return draft.port
      const mac = draft.primary ? device.mac : MacAddress.derive(device.mac, index + 1)
      return { ...draft.port, mac }
    })
  }
}
