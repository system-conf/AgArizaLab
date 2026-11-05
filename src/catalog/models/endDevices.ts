// End-device models. The v1 host kinds migrate to pc, pos, printer, ipCamera, kitchenDisplay
// (eth0 only) and smartphone (wlan0 only), MODEL_V2 §11, so these models have exactly those NICs.
// The IP phone has no PC pass-through port: an end device bridging a host NIC and a switched port
// needs engine support that does not exist yet (proposed for the VoIP pack 5.8).
import { wiredNic, wirelessNic } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

export const endDeviceModels: readonly CatalogDeviceModel[] = [
  defineModel({
    id: 'pc',
    kind: 'pc',
    category: 'endDevices',
    ports: [wiredNic('eth0')],
    capabilities: ['hostTerminal', 'appLinks'],
  }),
  defineModel({
    id: 'laptop',
    kind: 'laptop',
    category: 'endDevices',
    ports: [wiredNic('eth0'), wirelessNic()],
    capabilities: ['hostTerminal', 'appLinks', 'wirelessClient'],
  }),
  defineModel({
    id: 'printer',
    kind: 'printer',
    category: 'endDevices',
    ports: [wiredNic('eth0')],
    capabilities: [],
  }),
  defineModel({
    id: 'ipPhone',
    kind: 'ipPhone',
    category: 'endDevices',
    ports: [wiredNic('eth0')],
    capabilities: ['appLinks'],
  }),
  defineModel({
    id: 'pos',
    kind: 'pos',
    category: 'endDevices',
    ports: [wiredNic('eth0')],
    capabilities: ['hostTerminal', 'appLinks'],
  }),
  defineModel({
    id: 'ipCamera',
    kind: 'camera',
    category: 'endDevices',
    ports: [wiredNic('eth0')],
    capabilities: [],
  }),
  defineModel({
    id: 'kitchenDisplay',
    kind: 'kitchenDisplay',
    category: 'endDevices',
    ports: [wiredNic('eth0')],
    capabilities: ['appLinks'],
  }),
  defineModel({
    id: 'smartphone',
    kind: 'smartphone',
    category: 'endDevices',
    ports: [wirelessNic()],
    capabilities: ['wirelessClient', 'appLinks'],
  }),
  defineModel({
    id: 'tablet',
    kind: 'tablet',
    category: 'endDevices',
    ports: [wirelessNic()],
    capabilities: ['wirelessClient', 'appLinks'],
  }),
]
