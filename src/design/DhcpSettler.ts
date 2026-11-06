import type { Device, NetworkEngine, NetworkState, Port } from '../domain'
import { L3Interfaces } from '../engine'

/**
 * The designed network as it runs: every powered end device with a NIC in DHCP mode asks for an
 * address (like after switching everything on), in device order, on a copy of the state. A client
 * that gets no answer loses its old address (it would fall back to APIPA), so a stale lease never
 * makes a broken design look working. Never mutates its input.
 */
export class DhcpSettler {
  /**
   * Settled states per engine and input state. States are immutable, so a state settles the same
   * way every time: the review (check + single points of failure), the handover pack and repeated
   * live checks of one state share one settle.
   */
  private static readonly cache = new WeakMap<NetworkEngine, WeakMap<NetworkState, NetworkState>>()
  private readonly engine: NetworkEngine

  constructor(engine: NetworkEngine) {
    this.engine = engine
  }

  settle(state: NetworkState): NetworkState {
    let perEngine = DhcpSettler.cache.get(this.engine)
    if (!perEngine) {
      perEngine = new WeakMap()
      DhcpSettler.cache.set(this.engine, perEngine)
    }
    let settled = perEngine.get(state)
    if (!settled) {
      settled = this.renewAll(state)
      perEngine.set(state, settled)
    }
    return settled
  }

  private renewAll(state: NetworkState): NetworkState {
    let current = state
    for (const device of state.devices) {
      if (!device.powered || device.host === undefined || !this.hasDhcpNic(device)) continue
      const result = this.engine.renewDhcp(current, device.id)
      current = result.ok ? result.nextState : this.withoutDhcpAddresses(current, device.id)
    }
    return current
  }

  private hasDhcpNic(device: Device): boolean {
    return L3Interfaces.nics(device).some((nic) => nic.addressing === 'dhcp')
  }

  private withoutDhcpAddresses(state: NetworkState, deviceId: string): NetworkState {
    const device = state.devices.find((candidate) => candidate.id === deviceId)
    if (!device || !device.ports.some((port) => this.holdsDhcpAddress(port))) return state
    const ports = device.ports.map((port): Port => {
      if (port.role !== 'host' || !this.holdsDhcpAddress(port)) return port
      return { ...port, l3: { ...port.l3, ipv4: { ...port.l3.ipv4, address: '', mask: '' } } }
    })
    const cleared = { ...device, ports }
    return { ...state, devices: state.devices.map((candidate) => (candidate.id === deviceId ? cleared : candidate)) }
  }

  private holdsDhcpAddress(port: Port): boolean {
    return port.role === 'host' && port.l3.ipv4.addressing === 'dhcp' && port.l3.ipv4.address !== ''
  }
}
