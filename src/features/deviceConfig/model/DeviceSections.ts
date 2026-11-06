// Which configuration cards a device gets: from its settings groups and port roles (the device is
// authoritative), plus model capabilities for services a device may switch on later.
import type { DeviceModel, DeviceSection, DeviceV2 } from '../../../domain/v2'

export type ConfigSectionId =
  | 'general'
  | 'ports'
  | 'host'
  | 'appLinks'
  | 'vlans'
  | 'svis'
  | 'routing'
  | 'dhcp'
  | 'dns'
  | 'wireless'
  | 'internet'

/** Exercise lock section of each card; 'general' (name) follows the device lock only. */
export const LOCK_SECTION_OF: Record<ConfigSectionId, DeviceSection | null> = {
  general: null,
  ports: 'ports',
  host: 'host',
  appLinks: 'host',
  vlans: 'switching',
  svis: 'switching',
  routing: 'routing',
  dhcp: 'services',
  dns: 'services',
  wireless: 'wireless',
  internet: 'internet',
}

export class DeviceSections {
  /** Cards in display order. */
  static of(device: DeviceV2, model: DeviceModel | undefined): ConfigSectionId[] {
    const capabilities = new Set(model?.capabilities ?? [])
    const shown: Record<ConfigSectionId, boolean> = {
      general: true,
      ports: device.ports.some((port) => DeviceSections.isConfigurablePort(port.role)),
      host: device.host !== undefined,
      appLinks: device.host !== undefined && (capabilities.has('appLinks') || device.host.appLinks.length > 0),
      vlans: device.switching !== undefined,
      svis: device.switching !== undefined,
      routing: device.routing !== undefined,
      dhcp: device.services?.dhcp !== undefined || capabilities.has('dhcpServer'),
      dns: device.services?.dns !== undefined || capabilities.has('dnsServer'),
      wireless: device.wireless !== undefined,
      internet: device.internet !== undefined || device.kind === 'internet',
    }
    return (Object.keys(shown) as ConfigSectionId[]).filter((section) => shown[section])
  }

  /** Console and passive ports (hub, cloud handoffs) have nothing to set. */
  static isConfigurablePort(role: DeviceV2['ports'][number]['role']): boolean {
    return role === 'switched' || role === 'routed' || role === 'host' || role === 'radio'
  }
}
