// Design brief 4 — factory (docs/DESIGN_EXERCISES.md §4): an office building and a production hall
// 200 m apart (zones), linked by fiber; office, production (OT), camera and guest networks; cameras
// viewable from the office; guests isolated; within budget.
//
// Not included yet, added when the engine packs exist (DESIGN_EXERCISES.md §3, §4):
// - after STP (pack 5.1): "production keeps working when the office switch fails" =
//   survivesFailure({ scope: 'anyDevice', kinds: ['switch'] }, reachable(ot → erp)) with a second,
//   redundant link between the buildings;
// - after ACLs (pack 5.2): "the OT network is isolated from the office except the ERP server" =
//   notReachable(ot → office) next to reachable(ot → erp) on the shared router. "OT has no internet"
//   would also need a negated `internet` condition, which the contract does not have yet.
import type { DesignExerciseDefinition } from '../../domain'
import {
  accessPorts,
  defaultRouteVia,
  dhcpServer,
  dnsProxy,
  lanPool,
  routes,
  ssids,
  staticHost,
  subInterfaces,
  trunkPorts,
  vlans,
  wanPort,
} from './deviceSetup'
import { customerLocks, LabBuilder } from './labBuilder'

const SEED = 404
const BUDGET = 3500
const GUEST_SSID = 'Guest-WiFi'

const OFFICE = ['office1', 'office2', 'office3'] as const
const OT = ['hmi1', 'hmi2'] as const
const CAMERAS = ['camGate', 'camHall1', 'camHall2'] as const
const GUESTS = ['guestPhone', 'guestTablet'] as const
/** VLAN and subnet (first three octets) per network; the router's sub-interface is `.1`. */
const NETWORKS = [
  { id: 'office', vlan: 10, prefix: '10.20.10', name: 'OFFICE' },
  { id: 'ot', vlan: 20, prefix: '10.20.20', name: 'PRODUCTION' },
  { id: 'cameras', vlan: 30, prefix: '10.20.30', name: 'CAMERAS' },
] as const
const VLAN_DATABASE = NETWORKS.map((network) => ({ id: network.vlan, name: network.name }))
const ERP_ADDRESS = '10.20.10.10'

/** ISP; office building: PCs, ERP server, gate camera, guest devices; production hall: HMI PCs, cameras. */
function customer(): LabBuilder {
  return new LabBuilder(SEED)
    .zone('officeBuilding', { x: 20, y: 200 }, { width: 460, height: 420 }, 'blue')
    .zone('productionHall', { x: 600, y: 200 }, { width: 420, height: 420 }, 'amber')
    .add('internetCloud', 'isp', { x: 200, y: 20 })
    .addRow('pc', OFFICE, { x: 50, y: 470 }, 120)
    .add('server', 'erp', { x: 380, y: 470 })
    .add('ipCamera', 'camGate', { x: 380, y: 360 })
    .add('smartphone', 'guestPhone', { x: 50, y: 580 })
    .add('tablet', 'guestTablet', { x: 170, y: 580 })
    .addRow('pc', OT, { x: 640, y: 470 }, 140)
    .addRow('ipCamera', ['camHall1', 'camHall2'], { x: 640, y: 580 }, 140)
}

/**
 * Router-on-a-stick in the office building (VLAN 10 office, 20 OT, 30 cameras; DHCP per VLAN), a
 * Gigabit switch per building, one fiber trunk between them; guests on a wireless router with
 * its own ISP line (no router joins it to the company networks).
 */
function reference(): LabBuilder {
  const [office, ot, cameras] = NETWORKS
  return customer()
    .edit('erp', staticHost(ERP_ADDRESS, `${office.prefix}.1`, [`${office.prefix}.1`]))
    .add(
      'router2Port',
      'router',
      { x: 200, y: 130 },
      subInterfaces('Gi0/0', NETWORKS.map((network) => ({ vlan: network.vlan, address: `${network.prefix}.1` }))),
      wanPort('Gi0/1'),
      routes([defaultRouteVia('Gi0/1')]),
      dhcpServer(NETWORKS.map((network) => lanPool(network.id, network.prefix))),
      dnsProxy(),
    )
    .add(
      'switch24Gig',
      'officeSwitch',
      { x: 200, y: 280 },
      vlans(VLAN_DATABASE),
      trunkPorts(['Gi1/0/24', 'Gi1/1/1']),
      accessPorts(['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3', 'Gi1/0/4'], office.vlan),
      accessPorts(['Gi1/0/5'], cameras.vlan),
    )
    .add(
      'switch24GigPoe',
      'hallSwitch',
      { x: 760, y: 280 },
      vlans(VLAN_DATABASE),
      trunkPorts(['Gi1/1/1']),
      accessPorts(['Gi1/0/1', 'Gi1/0/2'], ot.vlan),
      accessPorts(['Gi1/0/3', 'Gi1/0/4'], cameras.vlan),
    )
    .add('wirelessRouter', 'guestRouter', { x: 60, y: 300 }, ssids([{ ssid: GUEST_SSID, vlan: 1 }]))
    .cable('wan', ['isp', 'eth0'], ['router', 'Gi0/1'])
    .cable('routerTrunk', ['router', 'Gi0/0'], ['officeSwitch', 'Gi1/0/24'])
    .cable('buildingFiber', ['officeSwitch', 'Gi1/1/1'], ['hallSwitch', 'Gi1/1/1'], 'fiber')
    .cable('office1Link', ['office1', 'eth0'], ['officeSwitch', 'Gi1/0/1'])
    .cable('office2Link', ['office2', 'eth0'], ['officeSwitch', 'Gi1/0/2'])
    .cable('office3Link', ['office3', 'eth0'], ['officeSwitch', 'Gi1/0/3'])
    .cable('erpLink', ['erp', 'eth0'], ['officeSwitch', 'Gi1/0/4'])
    .cable('camGateLink', ['camGate', 'eth0'], ['officeSwitch', 'Gi1/0/5'])
    .cable('hmi1Link', ['hmi1', 'eth0'], ['hallSwitch', 'Gi1/0/1'])
    .cable('hmi2Link', ['hmi2', 'eth0'], ['hallSwitch', 'Gi1/0/2'])
    .cable('camHall1Link', ['camHall1', 'eth0'], ['hallSwitch', 'Gi1/0/3'])
    .cable('camHall2Link', ['camHall2', 'eth0'], ['hallSwitch', 'Gi1/0/4'])
    .cable('guestWan', ['isp', 'eth1'], ['guestRouter', 'WAN'])
    .wireless('guestPhoneWifi', 'guestPhone', 'guestRouter', GUEST_SSID)
    .wireless('guestTabletWifi', 'guestTablet', 'guestRouter', GUEST_SSID)
}

export function factoryBrief(): DesignExerciseDefinition {
  const start = customer().build()
  const business = [...OFFICE, 'erp', ...OT]
  return {
    id: 'factory',
    order: 4,
    setting: 'factory',
    lab: start,
    locks: customerLocks(start.state),
    groups: [
      { id: 'office', name: 'office', deviceIds: [...OFFICE] },
      { id: 'erp', name: 'erp', deviceIds: ['erp'] },
      { id: 'officeNetwork', name: 'officeNetwork', deviceIds: [...OFFICE, 'erp'] },
      { id: 'ot', name: 'ot', deviceIds: [...OT] },
      { id: 'cameras', name: 'cameras', deviceIds: [...CAMERAS] },
      { id: 'business', name: 'business', deviceIds: business },
      { id: 'internal', name: 'internal', deviceIds: [...business, ...CAMERAS] },
      { id: 'guests', name: 'guests', deviceIds: [...GUESTS] },
    ],
    requirements: [
      { id: 'officeOnline', condition: { type: 'internet', group: 'office' } },
      { id: 'officeDns', condition: { type: 'resolves', group: 'office', name: 'google.com' } },
      { id: 'officeDhcp', condition: { type: 'dhcpServes', group: 'office' } },
      { id: 'erpFromOffice', condition: { type: 'reachable', fromGroup: 'office', toGroup: 'erp' } },
      { id: 'erpFromProduction', condition: { type: 'reachable', fromGroup: 'ot', toGroup: 'erp' } },
      { id: 'camerasFromOffice', condition: { type: 'reachable', fromGroup: 'office', toGroup: 'cameras' } },
      { id: 'otSeparate', condition: { type: 'separateSubnets', groupA: 'officeNetwork', groupB: 'ot' } },
      { id: 'camerasSeparate', condition: { type: 'separateSubnets', groupA: 'cameras', groupB: 'business' } },
      { id: 'guestsOnline', condition: { type: 'internet', group: 'guests' } },
      { id: 'guestsIsolated', condition: { type: 'notReachable', fromGroup: 'guests', toGroup: 'internal' } },
      {
        id: 'productionOffline',
        hidden: true,
        condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'isp' }, requirement: { type: 'reachable', fromGroup: 'ot', toGroup: 'erp' } },
      },
      {
        id: 'camerasOffline',
        hidden: true,
        condition: {
          type: 'survivesFailure',
          failure: { scope: 'device', deviceId: 'isp' },
          requirement: { type: 'reachable', fromGroup: 'office', toGroup: 'cameras' },
        },
      },
      { id: 'budget', condition: { type: 'maxCost', amount: BUDGET } },
    ],
    budget: BUDGET,
    allowedModels: { categories: ['routers', 'switches', 'wireless'] },
    reference: reference().build(),
    reviewHints: [
      { id: 'presentation' },
      { id: 'fiber' },
      { id: 'futureRedundancy' },
      { id: 'vlanPlan', requirementId: 'camerasSeparate' },
      { id: 'cameraRouting', requirementId: 'camerasFromOffice' },
      { id: 'guestLine', requirementId: 'guestsIsolated' },
    ],
  }
}
