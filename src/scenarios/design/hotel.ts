// Design brief 5 — hotel (docs/DESIGN_EXERCISES.md §4): an access switch and guest Wi-Fi on every
// floor, reception and camera networks, and reception internet that survives the loss of the main
// line (layer-3 redundancy: two provider modems and a floating static default route).
// The guest VLAN is layer 2 only inside the hotel: its gateway is a separate guest router on its own
// ISP line, so guests are isolated without ACLs (pack 5.2).
import type { DesignExerciseDefinition } from '../../domain'
import {
  accessPorts,
  addRoutes,
  defaultRouteVia,
  dhcpServer,
  dnsProxy,
  homeGatewayLan,
  lanPool,
  PUBLIC_DNS,
  routedPort,
  routes,
  routeTo,
  ssids,
  staticHost,
  svis,
  trunkPorts,
  vlans,
  wanPort,
} from './deviceSetup'
import { customerLocks, LabBuilder } from './labBuilder'

const SEED = 505
const BUDGET = 5000
const GUEST_SSID = 'Hotel-Guest'
const RECEPTION = { vlan: 10, prefix: '10.40.10' }
const CAMERA_NET = { vlan: 20, prefix: '10.40.20' }
/** Summary of every hotel network behind the core switch (route back on the modems). */
const HOTEL_NETWORKS = '10.40.0.0'
const HOTEL_MASK = '255.255.0.0'
const GUEST_VLAN = 30
const VLAN_DATABASE = [
  { id: RECEPTION.vlan, name: 'RECEPTION' },
  { id: CAMERA_NET.vlan, name: 'CAMERAS' },
  { id: GUEST_VLAN, name: 'GUESTS' },
]
/** Floors with an access switch, an AP, a camera and a guest device. */
const FLOORS = [
  { id: 'floor1', y: 250, camera: 'camFloor1', guest: 'guestPhone', guestModel: 'smartphone' },
  { id: 'floor2', y: 60, camera: 'camFloor2', guest: 'guestTablet', guestModel: 'tablet' },
] as const
const CAMERAS = ['camLobby', ...FLOORS.map((floor) => floor.camera)]
const GUESTS = FLOORS.map((floor) => floor.guest)

/**
 * ISP with the two provider modems already installed (main line 192.168.0.1, backup line
 * re-addressed to 192.168.1.1 by its installer); reception PCs, NVR and lobby camera on the ground
 * floor; a camera and a guest device per floor.
 */
function customer(): LabBuilder {
  const lab = new LabBuilder(SEED)
    .zone('groundFloor', { x: 20, y: 400 }, { width: 980, height: 280 }, 'blue')
    .add('internetCloud', 'isp', { x: 1100, y: 420 })
    .add('dslModem', 'modemMain', { x: 880, y: 440 })
    .add('cableModem', 'modemBackup', { x: 880, y: 580 }, homeGatewayLan('192.168.1'))
    .cable('lineMain', ['isp', 'eth0'], ['modemMain', 'DSL'])
    .cable('lineBackup', ['isp', 'eth1'], ['modemBackup', 'Cable'])
    .addRow('pc', ['reception1', 'reception2'], { x: 60, y: 580 }, 120)
    .add('nvr', 'nvr', { x: 320, y: 580 })
    .add('ipCamera', 'camLobby', { x: 460, y: 580 })
  for (const floor of FLOORS) {
    lab
      .zone(floor.id, { x: 20, y: floor.y - 40 }, { width: 980, height: 170 }, 'green')
      .add('ipCamera', floor.camera, { x: 460, y: floor.y + 20 })
      .add(floor.guestModel, floor.guest, { x: 760, y: floor.y + 20 })
  }
  return lab
}

/**
 * L3 switch as the core (SVIs for reception and cameras, DHCP, two routed uplinks to the modems
 * with a floating default route), a PoE access switch and an AP per floor carrying the guest VLAN,
 * and a guest router on ISP port eth2 as the guest VLAN's only gateway.
 */
function reference(): LabBuilder {
  const lab = customer()
    .edit('nvr', staticHost(`${CAMERA_NET.prefix}.10`, `${CAMERA_NET.prefix}.1`, [PUBLIC_DNS]))
    // Without NAT the modems must know the way back to the hotel networks behind the core switch.
    .edit('modemMain', addRoutes([routeTo(HOTEL_NETWORKS, HOTEL_MASK, '192.168.0.2')]))
    .edit('modemBackup', addRoutes([routeTo(HOTEL_NETWORKS, HOTEL_MASK, '192.168.1.2')]))
    .add(
      'l3Switch24',
      'core',
      { x: 560, y: 450 },
      vlans(VLAN_DATABASE),
      svis([RECEPTION, CAMERA_NET].map((network) => ({ vlan: network.vlan, address: `${network.prefix}.1` }))),
      accessPorts(['Gi1/0/1', 'Gi1/0/2'], RECEPTION.vlan),
      accessPorts(['Gi1/0/3', 'Gi1/0/4'], CAMERA_NET.vlan),
      accessPorts(['Gi1/0/20'], GUEST_VLAN),
      trunkPorts(['Gi1/0/21', 'Gi1/0/22']),
      routedPort('Gi1/0/23', '192.168.0.2'),
      routedPort('Gi1/0/24', '192.168.1.2'),
      routes([routeTo('0.0.0.0', '0.0.0.0', '192.168.0.1'), routeTo('0.0.0.0', '0.0.0.0', '192.168.1.1', 10)]),
      dhcpServer([lanPool('reception', RECEPTION.prefix, [PUBLIC_DNS]), lanPool('cameras', CAMERA_NET.prefix, [PUBLIC_DNS])]),
    )
    .add(
      'router2Port',
      'guestRouter',
      { x: 700, y: 600 },
      routedPort('Gi0/0', '192.168.50.1'),
      wanPort('Gi0/1'),
      routes([defaultRouteVia('Gi0/1')]),
      dhcpServer([lanPool('guests', '192.168.50')]),
      dnsProxy(),
    )
    .cable('mainUplink', ['core', 'Gi1/0/23'], ['modemMain', 'LAN1'])
    .cable('backupUplink', ['core', 'Gi1/0/24'], ['modemBackup', 'LAN1'])
    .cable('reception1Link', ['reception1', 'eth0'], ['core', 'Gi1/0/1'])
    .cable('reception2Link', ['reception2', 'eth0'], ['core', 'Gi1/0/2'])
    .cable('nvrLink', ['nvr', 'eth0'], ['core', 'Gi1/0/3'])
    .cable('camLobbyLink', ['camLobby', 'eth0'], ['core', 'Gi1/0/4'])
    .cable('guestVlanLink', ['guestRouter', 'Gi0/0'], ['core', 'Gi1/0/20'])
    .cable('guestWan', ['isp', 'eth2'], ['guestRouter', 'Gi0/1'])
  FLOORS.forEach((floor, index) => {
    const switchId = `${floor.id}Switch`
    const apId = `${floor.id}Ap`
    lab
      .add('switch8Poe', switchId, { x: 300, y: floor.y }, vlans(VLAN_DATABASE.filter((entry) => entry.id !== RECEPTION.vlan)), trunkPorts(['Fa0/1', 'Fa0/2']), accessPorts(['Fa0/3'], CAMERA_NET.vlan))
      .add('accessPoint', apId, { x: 620, y: floor.y }, ssids([{ ssid: GUEST_SSID, vlan: GUEST_VLAN }]))
      .cable(`${floor.id}Trunk`, ['core', `Gi1/0/${21 + index}`], [switchId, 'Fa0/1'])
      .cable(`${floor.id}ApLink`, [apId, 'Gi0'], [switchId, 'Fa0/2'])
      .cable(`${floor.camera}Link`, [floor.camera, 'eth0'], [switchId, 'Fa0/3'])
      .wireless(`${floor.guest}Wifi`, floor.guest, apId, GUEST_SSID)
  })
  return lab
}

export function hotelBrief(): DesignExerciseDefinition {
  const start = customer().build()
  const reception = ['reception1', 'reception2']
  return {
    id: 'hotel',
    order: 5,
    setting: 'hotel',
    lab: start,
    locks: customerLocks(start.state),
    groups: [
      { id: 'reception', name: 'reception', deviceIds: reception },
      { id: 'recorder', name: 'recorder', deviceIds: ['nvr'] },
      { id: 'cameras', name: 'cameras', deviceIds: CAMERAS },
      { id: 'securityNetwork', name: 'securityNetwork', deviceIds: ['nvr', ...CAMERAS] },
      { id: 'staff', name: 'staff', deviceIds: [...reception, 'nvr', ...CAMERAS] },
      { id: 'guests', name: 'guests', deviceIds: GUESTS },
    ],
    requirements: [
      { id: 'receptionOnline', condition: { type: 'internet', group: 'reception' } },
      { id: 'receptionDhcp', condition: { type: 'dhcpServes', group: 'reception' } },
      {
        id: 'backupLine',
        condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'modemMain' }, requirement: { type: 'internet', group: 'reception' } },
      },
      { id: 'recording', condition: { type: 'reachable', fromGroup: 'recorder', toGroup: 'cameras' } },
      { id: 'receptionWatches', condition: { type: 'reachable', fromGroup: 'reception', toGroup: 'recorder' } },
      { id: 'camerasSeparate', condition: { type: 'separateSubnets', groupA: 'securityNetwork', groupB: 'reception' } },
      { id: 'guestsOnline', condition: { type: 'internet', group: 'guests' } },
      { id: 'guestsDhcp', condition: { type: 'dhcpServes', group: 'guests' } },
      { id: 'guestRoaming', condition: { type: 'sameVlan', group: 'guests' } },
      { id: 'guestsIsolated', condition: { type: 'notReachable', fromGroup: 'guests', toGroup: 'staff' } },
      {
        id: 'camerasOffline',
        hidden: true,
        condition: {
          type: 'survivesFailure',
          failure: { scope: 'device', deviceId: 'isp' },
          requirement: { type: 'reachable', fromGroup: 'recorder', toGroup: 'cameras' },
        },
      },
      { id: 'guestDns', hidden: true, condition: { type: 'resolves', group: 'guests', name: 'google.com' } },
      { id: 'budget', condition: { type: 'maxCost', amount: BUDGET } },
    ],
    budget: BUDGET,
    allowedModels: { categories: ['routers', 'switches', 'wireless'] },
    reference: reference().build(),
    reviewHints: [
      { id: 'presentation' },
      { id: 'floatingRoute', requirementId: 'backupLine' },
      { id: 'guestVlan', requirementId: 'guestsIsolated' },
      { id: 'roaming', requirementId: 'guestRoaming' },
      { id: 'poe' },
    ],
  }
}
