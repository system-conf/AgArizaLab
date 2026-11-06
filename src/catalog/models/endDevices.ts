// End-device models. The v1 host kinds migrate to pc, pos, printer, ipCamera, kitchenDisplay
// (eth0 only) and smartphone (wlan0 only), MODEL_V2 §11, so these models have exactly those NICs.
// The IP phone has no PC pass-through port: an end device bridging a host NIC and a switched port
// needs engine support that does not exist yet (proposed for the VoIP pack 5.8).
// The smart TV reuses the kitchen display kind (a screen with host NICs and app links, no
// terminal); the multifunction printer is a printer with an extra Wi-Fi NIC.
import type { DeviceCapability, DeviceKind, DeviceSubcategory } from '../../domain'
import { wiredNic, wirelessNic, type CatalogPortTemplate } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

function endDevice(
  id: string,
  kind: DeviceKind,
  subcategory: DeviceSubcategory,
  ports: readonly CatalogPortTemplate[],
  capabilities: readonly DeviceCapability[],
): CatalogDeviceModel {
  return defineModel({ id, kind, category: 'endDevices', subcategory, ports, capabilities })
}

export const endDeviceModels: readonly CatalogDeviceModel[] = [
  endDevice('pc', 'pc', 'pcLaptop', [wiredNic('eth0')], ['hostTerminal', 'appLinks']),
  endDevice('laptop', 'laptop', 'pcLaptop', [wiredNic('eth0'), wirelessNic()], ['hostTerminal', 'appLinks', 'wirelessClient']),
  endDevice('printer', 'printer', 'printer', [wiredNic('eth0')], []),
  endDevice('multifunctionPrinter', 'printer', 'printer', [wiredNic('eth0'), wirelessNic()], ['wirelessClient']),
  endDevice('ipPhone', 'ipPhone', 'phoneTablet', [wiredNic('eth0')], ['appLinks']),
  endDevice('smartphone', 'smartphone', 'phoneTablet', [wirelessNic()], ['wirelessClient', 'appLinks']),
  endDevice('tablet', 'tablet', 'phoneTablet', [wirelessNic()], ['wirelessClient', 'appLinks']),
  endDevice('ipCamera', 'camera', 'cameraNvr', [wiredNic('eth0')], []),
  endDevice('pos', 'pos', 'posDisplay', [wiredNic('eth0')], ['hostTerminal', 'appLinks']),
  endDevice('kitchenDisplay', 'kitchenDisplay', 'posDisplay', [wiredNic('eth0')], ['appLinks']),
  endDevice('smartTv', 'kitchenDisplay', 'posDisplay', [wiredNic('eth0'), wirelessNic()], ['appLinks', 'wirelessClient']),
]
