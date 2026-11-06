// Server-type end devices. nvr is what v1 NVRs migrate to (eth0 only, MODEL_V2 §11).
// The rack server differs from the tower server only in its four NICs (e.g. two teamed toward the
// LAN, one for a storage / backup network, one for management).
import { numberedPorts, wiredNic } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

const SERVER_CAPABILITIES = ['hostTerminal', 'appLinks', 'dhcpServer', 'dnsServer'] as const

export const serverModels: readonly CatalogDeviceModel[] = [
  defineModel({
    id: 'server',
    kind: 'server',
    category: 'servers',
    subcategory: 'server',
    ports: [wiredNic('eth0'), wiredNic('eth1')],
    capabilities: SERVER_CAPABILITIES,
  }),
  defineModel({
    id: 'rackServer',
    kind: 'server',
    category: 'servers',
    subcategory: 'server',
    ports: numberedPorts('eth', 0, 3, wiredNic),
    capabilities: SERVER_CAPABILITIES,
  }),
  defineModel({
    id: 'nvr',
    kind: 'nvr',
    category: 'servers',
    subcategory: 'cameraNvr',
    ports: [wiredNic('eth0')],
    capabilities: ['hostTerminal', 'appLinks'],
  }),
]
