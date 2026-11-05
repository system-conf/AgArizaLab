import { CableRules, type DeviceV2, type LinkEndV2, type LinkV2, type NetworkStateV2, type Port } from '../../domain/v2'

/** One end of a link seen from the other end. */
export interface FarEnd {
  link: LinkV2
  device: DeviceV2 | undefined
  port: Port | undefined
  end: LinkEndV2
}

const cableRules = new CableRules()

/**
 * Read-only index over one NetworkStateV2 (devices, ports, links per port, link status). States
 * are immutable, so one index per state object is built lazily and cached.
 */
export class TopologyV2 {
  private static readonly cache = new WeakMap<NetworkStateV2, TopologyV2>()

  readonly state: NetworkStateV2
  private readonly devices = new Map<string, DeviceV2>()
  private readonly linksByDevice = new Map<string, LinkV2[]>()
  private readonly linksByPort = new Map<string, LinkV2[]>()
  private readonly linkUp = new Map<string, boolean>()

  private constructor(state: NetworkStateV2) {
    this.state = state
    for (const device of state.devices) this.devices.set(device.id, device)
    for (const link of state.links) {
      for (const end of [link.a, link.b]) {
        this.push(this.linksByDevice, end.deviceId, link)
        this.push(this.linksByPort, TopologyV2.portKey(end.deviceId, end.portId), link)
      }
    }
  }

  static of(state: NetworkStateV2): TopologyV2 {
    let topology = TopologyV2.cache.get(state)
    if (!topology) {
      topology = new TopologyV2(state)
      TopologyV2.cache.set(state, topology)
    }
    return topology
  }

  /** Unknown ids are programmer errors (UI and exercises only pass ids from the state). */
  require(deviceId: string): DeviceV2 {
    const device = this.devices.get(deviceId)
    if (!device) throw new Error(`Unknown device id: ${deviceId}`)
    return device
  }

  find(deviceId: string): DeviceV2 | undefined {
    return this.devices.get(deviceId)
  }

  /** Links touching the device, in state order (a link to itself is listed once). */
  linksOf(deviceId: string): readonly LinkV2[] {
    return [...new Set(this.linksByDevice.get(deviceId) ?? [])]
  }

  /** Links plugged into one port (radio ports hold several), in state order. */
  linksAt(deviceId: string, portId: string): readonly LinkV2[] {
    return this.linksByPort.get(TopologyV2.portKey(deviceId, portId)) ?? []
  }

  /** The other end of `link` as seen from `deviceId`'s end `portId`. */
  farEnd(link: LinkV2, deviceId: string, portId: string): FarEnd {
    const end = link.a.deviceId === deviceId && link.a.portId === portId ? link.b : link.a
    const device = this.devices.get(end.deviceId)
    return { link, device, port: device?.ports.find((port) => port.id === end.portId), end }
  }

  /** The end of `link` that sits on `deviceId`. */
  ownEnd(link: LinkV2, deviceId: string): LinkEndV2 {
    return link.a.deviceId === deviceId ? link.a : link.b
  }

  /**
   * Does the link carry traffic? Plugged in, both devices powered, both ports administratively up,
   * a cable CableRules accepts (connector, pinouts when auto-MDIX is off on both ends) and, for
   * Wi-Fi, an SSID the radio side offers. Configuration above layer 1 is not considered.
   */
  isUp(link: LinkV2): boolean {
    let up = this.linkUp.get(link.id)
    if (up === undefined) {
      up = this.computeUp(link)
      this.linkUp.set(link.id, up)
    }
    return up
  }

  private computeUp(link: LinkV2): boolean {
    if (!link.connected) return false
    const ends = [link.a, link.b].map((end) => {
      const device = this.devices.get(end.deviceId)
      return { device, port: device?.ports.find((port) => port.id === end.portId) }
    })
    for (const { device, port } of ends) {
      if (!device || !port || !device.powered || !port.adminUp) return false
    }
    if (!cableRules.validateLink(this.state, link).ok) return false
    if (link.cable !== 'wireless') return true
    return ends.some(
      ({ device, port }) => port?.role === 'radio' && (device?.wireless?.ssids ?? []).some((entry) => entry.ssid === link.ssid),
    )
  }

  private push(map: Map<string, LinkV2[]>, key: string, link: LinkV2): void {
    const list = map.get(key)
    if (list) list.push(link)
    else map.set(key, [link])
  }

  private static portKey(deviceId: string, portId: string): string {
    return `${deviceId}\u0000${portId}`
  }
}
