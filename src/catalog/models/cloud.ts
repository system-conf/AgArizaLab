// WAN / ISP models.
// - The internet / ISP cloud. A migrated cloud gets eth0…eth3 (more only when a v1 lab had more
//   links to it, MODEL_V2 §11); each port is one service handoff (IspHandoff, MODEL_V2 §5).
// - The DSL and cable modems are ISP-supplied modem-routers ("home gateways"): they reuse the
//   wireless home router's behaviour (kind 'wirelessRouter': routed line port as a DHCP client with
//   a default route out of it, switched LAN ports, Wi-Fi, DHCP + DNS proxy on 192.168.0.1/24). The
//   phone line / coax is not modelled: the line port is a copper port cabled to a handoff port of
//   the internet cloud, exactly like the home router's WAN port. Bridge mode is not modelled.
import { numberedPorts, portTemplate, PORT_SPEEDS, radioTemplate } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

function homeGateway(id: string, linePortId: string, lanPorts: number): CatalogDeviceModel {
  return defineModel({
    id,
    kind: 'wirelessRouter',
    category: 'wan',
    subcategory: 'wanIsp',
    ports: [
      portTemplate(linePortId, 'copper', 'routed', PORT_SPEEDS.gigabit, 'wan'),
      ...numberedPorts('LAN', 1, lanPorts, (portId) => portTemplate(portId, 'copper', 'switched', PORT_SPEEDS.gigabit, 'lan')),
      radioTemplate(),
    ],
    capabilities: ['routing', 'l2Switching', 'wireless', 'dhcpServer', 'dnsServer'],
  })
}

export const cloudModels: readonly CatalogDeviceModel[] = [
  defineModel({
    id: 'internetCloud',
    kind: 'internet',
    category: 'wan',
    subcategory: 'wanIsp',
    ports: numberedPorts('eth', 0, 3, (id) => portTemplate(id, 'copper', 'passive', PORT_SPEEDS.gigabit, 'handoff')),
    capabilities: ['internetService'],
  }),
  homeGateway('dslModem', 'DSL', 4),
  homeGateway('cableModem', 'Cable', 2),
]
