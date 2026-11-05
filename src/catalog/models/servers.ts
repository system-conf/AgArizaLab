// Server-type end devices. nvr is what v1 NVRs migrate to (eth0 only, MODEL_V2 §11).
import { wiredNic } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

export const serverModels: readonly CatalogDeviceModel[] = [
  defineModel({
    id: 'server',
    kind: 'server',
    category: 'servers',
    ports: [wiredNic('eth0'), wiredNic('eth1')],
    capabilities: ['hostTerminal', 'appLinks', 'dhcpServer', 'dnsServer'],
  }),
  defineModel({
    id: 'nvr',
    kind: 'nvr',
    category: 'servers',
    ports: [wiredNic('eth0')],
    capabilities: ['hostTerminal', 'appLinks'],
  }),
]
