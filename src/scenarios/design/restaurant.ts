// Design brief 2 — restaurant (docs/DESIGN_EXERCISES.md §4): two POS terminals and a kitchen display
// on a staff network with internet for card payments, plus guest Wi-Fi. Guests must not reach the
// POS. Without ACLs (pack 5.2) the guest network gets its own wireless router on its own ISP line,
// so no router connects the two networks at all.
import type { DesignExerciseDefinition } from '../../domain'
import { defaultRouteVia, dhcpServer, dnsProxy, lanPool, routedPort, routes, ssids, wanPort } from './deviceSetup'
import { customerLocks, LabBuilder } from './labBuilder'

const SEED = 202
const BUDGET = 1200
const GUEST_SSID = 'Guest-WiFi'

/** ISP, POS terminals at the counter and in the dining room, kitchen display, two guest devices; zones. */
function customer(): LabBuilder {
  return new LabBuilder(SEED)
    .zone('counter', { x: 20, y: 360 }, { width: 300, height: 220 }, 'blue')
    .zone('kitchen', { x: 340, y: 360 }, { width: 220, height: 220 }, 'amber')
    .zone('dining', { x: 580, y: 360 }, { width: 380, height: 220 }, 'green')
    .add('internetCloud', 'isp', { x: 460, y: 20 })
    .add('pos', 'pos1', { x: 60, y: 460 })
    .add('pos', 'pos2', { x: 200, y: 460 })
    .add('kitchenDisplay', 'kitchenScreen', { x: 400, y: 460 })
    .add('smartphone', 'guestPhone', { x: 640, y: 480 })
    .add('tablet', 'guestTablet', { x: 820, y: 480 })
}

/**
 * Staff: router (DHCP 192.168.10.0/24, DNS proxy) + 8-port switch on ISP port eth0. Guests: a
 * wireless router with its factory LAN (192.168.0.0/24) on its own line, ISP port eth1.
 */
function reference(): LabBuilder {
  return customer()
    .add(
      'router2Port',
      'router',
      { x: 300, y: 140 },
      routedPort('Gi0/0', '192.168.10.1'),
      wanPort('Gi0/1'),
      routes([defaultRouteVia('Gi0/1')]),
      dhcpServer([lanPool('staff', '192.168.10')]),
      dnsProxy(),
    )
    .add('switch8', 'switch', { x: 200, y: 280 })
    .add('wirelessRouter', 'guestRouter', { x: 720, y: 220 }, ssids([{ ssid: GUEST_SSID, vlan: 1 }]))
    .cable('wan', ['isp', 'eth0'], ['router', 'Gi0/1'])
    .cable('uplink', ['router', 'Gi0/0'], ['switch', 'Fa0/1'])
    .cable('pos1Link', ['pos1', 'eth0'], ['switch', 'Fa0/2'])
    .cable('pos2Link', ['pos2', 'eth0'], ['switch', 'Fa0/3'])
    .cable('kitchenLink', ['kitchenScreen', 'eth0'], ['switch', 'Fa0/4'])
    .cable('guestWan', ['isp', 'eth1'], ['guestRouter', 'WAN'])
    .wireless('guestPhoneWifi', 'guestPhone', 'guestRouter', GUEST_SSID)
    .wireless('guestTabletWifi', 'guestTablet', 'guestRouter', GUEST_SSID)
}

export function restaurantBrief(): DesignExerciseDefinition {
  const start = customer().build()
  return {
    id: 'restaurant',
    order: 2,
    setting: 'restaurant',
    lab: start,
    locks: customerLocks(start.state),
    groups: [
      { id: 'pos', name: 'pos', deviceIds: ['pos1', 'pos2'] },
      { id: 'kitchen', name: 'kitchen', deviceIds: ['kitchenScreen'] },
      { id: 'staff', name: 'staff', deviceIds: ['pos1', 'pos2', 'kitchenScreen'] },
      { id: 'guests', name: 'guests', deviceIds: ['guestPhone', 'guestTablet'] },
    ],
    requirements: [
      { id: 'posOnline', condition: { type: 'internet', group: 'pos' } },
      { id: 'paymentDns', condition: { type: 'resolves', group: 'pos', name: 'odeme.ornekbanka.com.tr' } },
      { id: 'orders', condition: { type: 'reachable', fromGroup: 'pos', toGroup: 'kitchen' } },
      { id: 'staffDhcp', condition: { type: 'dhcpServes', group: 'staff' } },
      { id: 'guestsOnline', condition: { type: 'internet', group: 'guests' } },
      { id: 'guestsDhcp', condition: { type: 'dhcpServes', group: 'guests' } },
      { id: 'guestsIsolated', condition: { type: 'notReachable', fromGroup: 'guests', toGroup: 'staff' } },
      { id: 'separateNetworks', condition: { type: 'separateSubnets', groupA: 'guests', groupB: 'staff' } },
      {
        id: 'ordersOffline',
        hidden: true,
        condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'isp' }, requirement: { type: 'reachable', fromGroup: 'pos', toGroup: 'kitchen' } },
      },
      { id: 'budget', condition: { type: 'maxCost', amount: BUDGET } },
    ],
    budget: BUDGET,
    allowedModels: { categories: ['routers', 'switches', 'wireless'] },
    reference: reference().build(),
    reviewHints: [
      { id: 'presentation' },
      { id: 'noAcls' },
      { id: 'isolation', requirementId: 'guestsIsolated' },
      { id: 'kitchenOffline', requirementId: 'ordersOffline' },
    ],
  }
}
