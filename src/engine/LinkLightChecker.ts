import type { LinkLight } from '../domain/EngineContract'
import type { Device, Link, LinkEnd, NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'

/**
 * Physical link light (v1.1): cable, power and switch-port state only.
 * IP, VLAN and DNS settings are deliberately ignored so the light never gives away a config fault.
 */
export class LinkLightChecker {
  /** Unknown ids are programmer errors (the UI only passes link ids from the state). */
  light(state: NetworkState, linkId: string): LinkLight {
    const link = state.links.find((candidate) => candidate.id === linkId)
    if (!link) throw new Error(`Unknown link id: ${linkId}`)
    return this.isUp(state, link) ? 'up' : 'down'
  }

  private isUp(state: NetworkState, link: Link): boolean {
    if (!link.connected) return false
    const deviceA = DeviceLookup.find(state, link.a.deviceId)
    const deviceB = DeviceLookup.find(state, link.b.deviceId)
    if (!deviceA || !deviceB || !deviceA.powered || !deviceB.powered) return false
    if (link.ssid !== undefined) return this.ssidKnown(deviceA, deviceB, link.ssid)
    return this.switchPortUp(deviceA, link.a) && this.switchPortUp(deviceB, link.b)
  }

  /** Wireless: the client is associated only when an AP end offers that SSID. */
  private ssidKnown(deviceA: Device, deviceB: Device, ssid: string): boolean {
    return [deviceA, deviceB].some(
      (device) =>
        device.kind === 'accessPoint' &&
        (device.wirelessNetworks ?? []).some((network) => network.ssid === ssid),
    )
  }

  /** Non-switch ends always pass; a switch end needs an existing, enabled port. */
  private switchPortUp(device: Device, end: LinkEnd): boolean {
    if (device.kind !== 'switch') return true
    const port = device.switchPorts?.find((candidate) => candidate.id === end.portId)
    return port !== undefined && port.enabled
  }
}
