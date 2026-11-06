// What a device does in the simulation, read from its configuration (docs/SIMULATION.md §6.2), never
// from `kind` alone (MODEL_V2 §1) except for the two kind-only behaviours: hubs repeat, the cloud is
// the internet. Layers branch on the profile to compose their handlers.
import type { Device } from '../../domain'

export interface DeviceProfile {
  readonly deviceId: string
  /** Hub: repeats every frame out of every other port (layer 1, no learning). */
  readonly repeater: boolean
  /** Has switched or radio ports: MAC learning, VLANs, flooding (switch, L3 switch, AP, wireless router). */
  readonly bridge: boolean
  /**
   * - `router`: `routing.ipRouting` (router, L3 switch with `ip routing`, wireless router)
   * - `host`: sends and answers from its own addresses only (end devices, a switch's management SVI)
   * - `none`: no layer-3 interface (hub, AP without SVI, cloud)
   */
  readonly ipRole: 'router' | 'host' | 'none'
  /** The internet cloud: provider edge on its handoff ports, every public address behind it. */
  readonly isp: boolean
  readonly dhcpServer: boolean
  readonly dnsServer: boolean
}

export class DeviceProfiles {
  private static readonly cache = new WeakMap<Device, DeviceProfile>()

  static of(device: Device): DeviceProfile {
    let profile = DeviceProfiles.cache.get(device)
    if (!profile) {
      profile = DeviceProfiles.build(device)
      DeviceProfiles.cache.set(device, profile)
    }
    return profile
  }

  private static build(device: Device): DeviceProfile {
    const hasRole = (role: 'switched' | 'radio' | 'host' | 'routed') => device.ports.some((port) => port.role === role)
    const hasSvi = (device.switching?.svis.length ?? 0) > 0
    let ipRole: DeviceProfile['ipRole'] = 'none'
    if (device.routing?.ipRouting === true) ipRole = 'router'
    else if (hasRole('host') || hasRole('routed') || hasSvi) ipRole = 'host'
    return {
      deviceId: device.id,
      repeater: device.kind === 'hub',
      bridge: hasRole('switched') || hasRole('radio'),
      ipRole,
      isp: device.kind === 'internet',
      dhcpServer: device.services?.dhcp?.enabled === true,
      dnsServer: device.services?.dns?.enabled === true,
    }
  }
}
