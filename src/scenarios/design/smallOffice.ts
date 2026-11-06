// Design brief 1 — small office (docs/DESIGN_EXERCISES.md §4): an accounting office with six PCs and
// a network printer that every PC already knows as 192.168.1.10. The learner adds a router and a
// switch: DHCP for the PCs, the printer stays static, internet with DNS, within budget.
import type { DesignExerciseDefinition } from '../../domain'
import { dhcpServer, dnsProxy, lanPool, routedPort, routes, defaultRouteVia, staticHost, wanPort } from './deviceSetup'
import { customerLocks, LabBuilder } from './labBuilder'

const SEED = 101
const PCS = ['pc1', 'pc2', 'pc3', 'pc4', 'pc5', 'pc6'] as const
const BUDGET = 1000

/** ISP, six PCs (DHCP, no address yet) and the printer (not configured yet). */
function customer(): LabBuilder {
  return new LabBuilder(SEED)
    .add('internetCloud', 'isp', { x: 460, y: 20 })
    .addRow('pc', PCS.slice(0, 3), { x: 80, y: 420 }, 150)
    .addRow('pc', PCS.slice(3), { x: 80, y: 560 }, 150)
    .add('printer', 'printer', { x: 620, y: 500 })
}

/** Router (DHCP, DNS proxy, default route) + one 8-port switch; printer static on 192.168.1.10. */
function reference(): LabBuilder {
  const lab = customer()
    .edit('printer', staticHost('192.168.1.10', '192.168.1.1', ['192.168.1.1']))
    .add(
      'router2Port',
      'router',
      { x: 460, y: 140 },
      routedPort('Gi0/0', '192.168.1.1'),
      wanPort('Gi0/1'),
      routes([defaultRouteVia('Gi0/1')]),
      dhcpServer([lanPool('office', '192.168.1')]),
      dnsProxy(),
    )
    .add('switch8', 'switch', { x: 460, y: 280 })
    .cable('wan', ['isp', 'eth0'], ['router', 'Gi0/1'])
    .cable('uplink', ['router', 'Gi0/0'], ['switch', 'Fa0/1'])
    .cable('printerLink', ['printer', 'eth0'], ['switch', 'Fa0/8'])
  PCS.forEach((pc, index) => lab.cable(`${pc}Link`, [pc, 'eth0'], ['switch', `Fa0/${index + 2}`]))
  return lab
}

export function smallOfficeBrief(): DesignExerciseDefinition {
  const start = customer().build()
  return {
    id: 'smallOffice',
    order: 1,
    setting: 'office',
    lab: start,
    locks: customerLocks(start.state),
    groups: [
      { id: 'pcs', name: 'pcs', deviceIds: [...PCS] },
      { id: 'printer', name: 'printer', deviceIds: ['printer'] },
      { id: 'office', name: 'office', deviceIds: [...PCS, 'printer'] },
    ],
    requirements: [
      { id: 'pcsOnline', condition: { type: 'internet', group: 'pcs' } },
      { id: 'pcsDns', condition: { type: 'resolves', group: 'pcs', name: 'google.com' } },
      { id: 'pcsDhcp', condition: { type: 'dhcpServes', group: 'pcs' } },
      { id: 'printerAddress', condition: { type: 'addressPlan', group: 'printer', prefix: '192.168.1.10/32' } },
      { id: 'officePlan', condition: { type: 'addressPlan', group: 'office', prefix: '192.168.1.0/24' } },
      { id: 'printing', condition: { type: 'reachable', fromGroup: 'pcs', toGroup: 'printer' } },
      {
        id: 'printingOffline',
        hidden: true,
        condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'isp' }, requirement: { type: 'reachable', fromGroup: 'pcs', toGroup: 'printer' } },
      },
      { id: 'budget', condition: { type: 'maxCost', amount: BUDGET } },
    ],
    budget: BUDGET,
    allowedModels: { categories: ['routers', 'switches', 'wireless'] },
    reference: reference().build(),
    reviewHints: [
      { id: 'presentation' },
      { id: 'dhcpPool', requirementId: 'pcsDhcp' },
      { id: 'printerStatic', requirementId: 'printerAddress' },
      { id: 'localTraffic', requirementId: 'printingOffline' },
    ],
  }
}
