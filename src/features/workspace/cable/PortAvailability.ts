// Which ports of a device the cable tool may use right now (free / in use / not compatible).
import { CableRules } from '../../../domain'
import type {
  CableCheck,
  CableRefusal,
  CableTool,
  CableType,
  Device,
  LinkEnd,
  NetworkState,
  Port,
  PortMedium,
} from '../../../domain'

export type PortStatus = 'free' | 'inUse' | 'incompatible'

export interface PortOption {
  port: Port
  status: PortStatus
  /** Why the port cannot be used (absent when free). */
  reason?: CableRefusal
  /** The other end of the cable already plugged into this port (non-radio ports). */
  linkedTo?: LinkEnd
}

/** A cable whose connector fits each medium; used to probe ports for the 'auto' tool. */
const PROBE_CABLE: Readonly<Record<PortMedium, CableType>> = {
  copper: 'copperStraight',
  fiber: 'fiber',
  serial: 'serial',
  console: 'console',
  coaxial: 'coaxial',
  wireless: 'wireless',
}

export class PortAvailability {
  private readonly rules: CableRules

  constructor(rules: CableRules = new CableRules()) {
    this.rules = rules
  }

  /** Ports of `deviceId` as the first end of a cable laid with `tool`. */
  forFirstEnd(network: NetworkState, deviceId: string, tool: CableTool): PortOption[] {
    const device = this.device(network, deviceId)
    if (!device) return []
    return device.ports.map((port) => {
      const end = { deviceId, portId: port.id }
      const cable = tool === 'auto' ? PROBE_CABLE[port.medium] : tool
      return this.option(network, end, port, this.rules.checkEnd(network, end, cable))
    })
  }

  /** Ports of `deviceId` as the second end, the first end being `first`. */
  forSecondEnd(network: NetworkState, first: LinkEnd, deviceId: string, tool: CableTool): PortOption[] {
    const device = this.device(network, deviceId)
    if (!device) return []
    return device.ports.map((port) => {
      const end = { deviceId, portId: port.id }
      if (deviceId === first.deviceId) return this.option(network, end, port, { ok: false, reason: 'sameDevice' })
      const cable = tool === 'auto' ? this.rules.autoCable(network, first, end) : tool
      if (cable === null) return this.option(network, end, port, { ok: false, reason: this.autoRefusal(network, first, port) })
      return this.option(network, end, port, this.rules.checkEnd(network, end, cable))
    })
  }

  /** True when at least one port could take the cable (for dimming devices on the canvas). */
  hasUsablePort(options: readonly PortOption[]): boolean {
    return options.some((option) => option.status === 'free')
  }

  private device(network: NetworkState, deviceId: string): Device | undefined {
    return network.devices.find((candidate) => candidate.id === deviceId)
  }

  /** Why 'auto' found no cable: two wireless ports of the wrong roles, or different media. */
  private autoRefusal(network: NetworkState, first: LinkEnd, port: Port): CableRefusal {
    const firstPort = this.device(network, first.deviceId)?.ports.find((candidate) => candidate.id === first.portId)
    const bothWireless = firstPort?.medium === 'wireless' && port.medium === 'wireless'
    return bothWireless ? 'wirelessNeedsClientAndRadio' : 'cableDoesNotFitPort'
  }

  private option(network: NetworkState, end: LinkEnd, port: Port, check: CableCheck): PortOption {
    if (check.ok) return { port, status: 'free' }
    if (check.reason === 'portInUse') {
      return { port, status: 'inUse', reason: check.reason, linkedTo: this.linkedTo(network, end) }
    }
    return { port, status: 'incompatible', reason: check.reason }
  }

  private linkedTo(network: NetworkState, end: LinkEnd): LinkEnd | undefined {
    const isEnd = (candidate: LinkEnd) => candidate.deviceId === end.deviceId && candidate.portId === end.portId
    const link = network.links.find((candidate) => isEnd(candidate.a) || isEnd(candidate.b))
    if (!link) return undefined
    return isEnd(link.a) ? link.b : link.a
  }
}
