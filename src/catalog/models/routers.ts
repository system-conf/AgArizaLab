// Router models. router2Port is what every v1 router migrates to (MODEL_V2 §11): Gi0/0 = v1 'lan',
// Gi0/1 = v1 'wan', plus Console. Port ids follow the IOS naming of small branch routers.
import { consoleTemplate, numberedPorts, portTemplate, PORT_SPEEDS, type PortGroup } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

const ROUTER_CAPABILITIES = ['routing', 'dhcpServer', 'dnsServer', 'deviceCli'] as const

function gigabitRouted(id: string, group: PortGroup) {
  return portTemplate(id, 'copper', 'routed', PORT_SPEEDS.gigabit, group)
}

function serialRouted(id: string) {
  return portTemplate(id, 'serial', 'routed', PORT_SPEEDS.none, 'serial')
}

export const routerModels: readonly CatalogDeviceModel[] = [
  defineModel({
    id: 'router2Port',
    kind: 'router',
    category: 'routers',
    ports: [gigabitRouted('Gi0/0', 'lan'), gigabitRouted('Gi0/1', 'wan'), consoleTemplate()],
    capabilities: ROUTER_CAPABILITIES,
  }),
  defineModel({
    id: 'router4Port',
    kind: 'router',
    category: 'routers',
    ports: [...numberedPorts('Gi0/', 0, 3, (id) => gigabitRouted(id, 'ethernet')), consoleTemplate()],
    capabilities: ROUTER_CAPABILITIES,
  }),
  defineModel({
    id: 'router2PortSerial',
    kind: 'router',
    category: 'routers',
    ports: [
      gigabitRouted('Gi0/0', 'lan'),
      gigabitRouted('Gi0/1', 'wan'),
      ...numberedPorts('Se0/0/', 0, 1, serialRouted),
      consoleTemplate(),
    ],
    capabilities: ROUTER_CAPABILITIES,
  }),
]
