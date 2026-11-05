// Wireless models. accessPoint is what every v1 access point migrates to (MODEL_V2 §11): Gi0 =
// v1 'uplink' (switched copper), Radio0 = v1 'radio'. The home router follows MODEL_V2 §3.
import { numberedPorts, portTemplate, PORT_SPEEDS, radioTemplate } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

/** WAN port id of the wireless home router (also the exit interface of its default route). */
export const WIRELESS_ROUTER_WAN_PORT = 'WAN'

export const wirelessModels: readonly CatalogDeviceModel[] = [
  defineModel({
    id: 'accessPoint',
    kind: 'accessPoint',
    category: 'wireless',
    ports: [portTemplate('Gi0', 'copper', 'switched', PORT_SPEEDS.gigabit, 'uplink'), radioTemplate()],
    capabilities: ['wireless'],
  }),
  defineModel({
    id: 'wirelessRouter',
    kind: 'wirelessRouter',
    category: 'wireless',
    ports: [
      portTemplate(WIRELESS_ROUTER_WAN_PORT, 'copper', 'routed', PORT_SPEEDS.gigabit, 'wan'),
      ...numberedPorts('LAN', 1, 4, (id) => portTemplate(id, 'copper', 'switched', PORT_SPEEDS.gigabit, 'lan')),
      radioTemplate(),
    ],
    capabilities: ['routing', 'l2Switching', 'wireless', 'dhcpServer', 'dnsServer'],
  }),
]
