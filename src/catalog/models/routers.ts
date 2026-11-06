// Router models. router2Port is what every v1 router migrates to (MODEL_V2 §11): Gi0/0 = v1 'lan',
// Gi0/1 = v1 'wan', plus Console. Port ids follow the IOS naming of small branch routers; the
// serial variants carry a two-port serial WAN module (Se0/0/x on the 2-port, Se0/1/x on the 4-port).
import { consoleTemplate, numberedPorts, portTemplate, PORT_SPEEDS, type PortGroup } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

const ROUTER_CAPABILITIES = ['routing', 'dhcpServer', 'dnsServer', 'deviceCli'] as const

function gigabitRouted(id: string, group: PortGroup) {
  return portTemplate(id, 'copper', 'routed', PORT_SPEEDS.gigabit, group)
}

function serialRouted(id: string) {
  return portTemplate(id, 'serial', 'routed', PORT_SPEEDS.none, 'serial')
}

function ethernetPorts(count: number) {
  return numberedPorts('Gi0/', 0, count - 1, (id) => gigabitRouted(id, 'ethernet'))
}

function router(id: string, ports: CatalogDeviceModel['ports']): CatalogDeviceModel {
  return defineModel({ id, kind: 'router', category: 'routers', subcategory: 'router', ports, capabilities: ROUTER_CAPABILITIES })
}

export const routerModels: readonly CatalogDeviceModel[] = [
  router('router2Port', [gigabitRouted('Gi0/0', 'lan'), gigabitRouted('Gi0/1', 'wan'), consoleTemplate()]),
  router('router3Port', [...ethernetPorts(3), consoleTemplate()]),
  router('router4Port', [...ethernetPorts(4), consoleTemplate()]),
  router('router2PortSerial', [
    gigabitRouted('Gi0/0', 'lan'),
    gigabitRouted('Gi0/1', 'wan'),
    ...numberedPorts('Se0/0/', 0, 1, serialRouted),
    consoleTemplate(),
  ]),
  router('router4PortSerial', [...ethernetPorts(4), ...numberedPorts('Se0/1/', 0, 1, serialRouted), consoleTemplate()]),
]
