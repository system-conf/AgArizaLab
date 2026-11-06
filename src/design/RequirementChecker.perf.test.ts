import { describe, expect, it } from 'vitest'
import type { DesignRequirement, Device, Link, NetworkState } from '../domain'
import { accessMode, labCloud, labHost, labLink, labRouter, labSwitch, trunkMode } from '../engine/testLabs'
import { RequirementChecker, type DesignRules } from './RequirementChecker'

const ACCESS_SWITCHES = 4
const HOSTS_PER_SWITCH = 23

function hostId(switchIndex: number, port: number): string {
  return `h${switchIndex}x${port}`
}

function vlanOf(port: number): number {
  return port % 2 === 0 ? 10 : 20
}

function pool(vlan: number) {
  const base = `10.${vlan}.0`
  return { id: `vlan${vlan}`, network: `${base}.0`, mask: '255.255.255.0', defaultRouter: `${base}.1`, dnsServers: [`${base}.1`], leases: [] }
}

/**
 * ~100 devices: ISP — router (VLAN 10 / 20 on a stick, DHCP, DNS proxy) — core switch — 4 access
 * switches with 23 DHCP hosts each (alternating VLANs) + 2 static servers on the core.
 */
function campus(): NetworkState {
  const router: Device = {
    ...labRouter(
      'router',
      [{ id: 'Gi0/0', subInterfaces: [{ vlan: 10, ip: '10.10.0.1' }, { vlan: 20, ip: '10.20.0.1' }] }, { id: 'Gi0/1', addressing: 'dhcp' }],
      [{ prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }],
    ),
    services: {
      dhcp: { enabled: true, pools: [pool(10), pool(20)], excludedRanges: [{ start: '10.10.0.1', end: '10.10.0.20' }] },
      dns: { enabled: true, forwarders: ['8.8.8.8'], records: [] },
    },
  }
  const devices: Device[] = [labCloud('isp'), router]
  const links: Link[] = [labLink('wan', ['isp', 'eth0'], ['router', 'Gi0/1']), labLink('uplink', ['router', 'Gi0/0'], ['core', 'Fa0/1'])]
  const corePorts = [trunkMode(), ...Array.from({ length: ACCESS_SWITCHES }, () => trunkMode()), accessMode(10), accessMode(10)]
  devices.push(labSwitch('core', corePorts, [10, 20]))
  for (let index = 1; index <= ACCESS_SWITCHES; index += 1) {
    const ports = [trunkMode(), ...Array.from({ length: HOSTS_PER_SWITCH }, (_, port) => accessMode(vlanOf(port)))]
    devices.push(labSwitch(`acc${index}`, ports, [10, 20]))
    links.push(labLink(`core${index}`, ['core', `Fa0/${index + 1}`], [`acc${index}`, 'Fa0/1']))
    for (let port = 0; port < HOSTS_PER_SWITCH; port += 1) {
      devices.push(labHost(hostId(index, port), '', { addressing: 'dhcp' }))
      links.push(labLink(`l${index}x${port}`, [hostId(index, port), 'eth0'], [`acc${index}`, `Fa0/${port + 2}`]))
    }
  }
  for (const [offset, id] of ['s1', 's2'].entries()) {
    devices.push(labHost(id, `10.10.0.${10 + offset}`, { kind: 'server', gateway: '10.10.0.1', dns: ['10.10.0.1'] }))
    links.push(labLink(`${id}Link`, [id, 'eth0'], ['core', `Fa0/${ACCESS_SWITCHES + 2 + offset}`]))
  }
  return { devices, links }
}

function groupOf(vlan: number): string[] {
  const ids: string[] = []
  for (let index = 1; index <= ACCESS_SWITCHES; index += 1) {
    for (let port = 0; port < HOSTS_PER_SWITCH; port += 1) if (vlanOf(port) === vlan) ids.push(hostId(index, port))
  }
  return ids
}

const requirements: DesignRequirement[] = [
  { id: 'staffOnline', condition: { type: 'internet', group: 'staff' } },
  { id: 'guestsOnline', condition: { type: 'internet', group: 'guests' } },
  { id: 'staffDns', condition: { type: 'resolves', group: 'staff', name: 'google.com' } },
  { id: 'servers', condition: { type: 'reachable', fromGroup: 'staff', toGroup: 'servers' } },
  { id: 'staffDhcp', condition: { type: 'dhcpServes', group: 'staff' } },
  { id: 'guestDhcp', condition: { type: 'dhcpServes', group: 'guests' } },
  { id: 'subnets', condition: { type: 'separateSubnets', groupA: 'staff', groupB: 'guests' } },
  { id: 'staffVlan', condition: { type: 'sameVlan', group: 'staff' } },
  { id: 'plan', condition: { type: 'addressPlan', group: 'staff', prefix: '10.10.0.0/24' } },
  { id: 'isolation', condition: { type: 'notReachable', fromGroup: 'guests', toGroup: 'servers' } },
  {
    id: 'offline',
    condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'isp' }, requirement: { type: 'reachable', fromGroup: 'staff', toGroup: 'servers' } },
  },
  { id: 'anyLink', condition: { type: 'survivesFailure', failure: { scope: 'anyLink' }, requirement: { type: 'internet', group: 'guests' } } },
  { id: 'router', condition: { type: 'uses', capability: 'routing' } },
  { id: 'budget', condition: { type: 'maxCost', amount: 5000 } },
]

describe('RequirementChecker performance', () => {
  it('checks a ~100-device lab fast enough for a debounced live checklist', () => {
    const state = campus()
    const rules: DesignRules = {
      lab: { state: { devices: [], links: [] } },
      groups: [
        { id: 'staff', name: 'staff', deviceIds: groupOf(10) },
        { id: 'guests', name: 'guests', deviceIds: groupOf(20) },
        { id: 'servers', name: 'servers', deviceIds: ['s1', 's2'] },
      ],
      requirements,
    }
    const checker = new RequirementChecker(rules)
    expect(state.devices.length).toBeGreaterThanOrEqual(100)
    const first = checker.check(state)
    const ok = Object.fromEntries(first.map((result) => [result.requirement.id, result.ok]))
    expect(ok).toMatchObject({ staffOnline: true, guestsOnline: true, staffDns: true, servers: true, staffDhcp: true, subnets: true, staffVlan: true, plan: true })
    // Inter-VLAN routing on the router: guests reach the servers; the WAN link is a single point of failure.
    expect(ok).toMatchObject({ isolation: false, anyLink: false, offline: true })

    // Measured 2026-11-06 on a dev machine: ~140 ms per check, about two thirds of it settling DHCP
    // for 92 clients. The bound is a regression guard with headroom for slow CI runners.
    const runs = 5
    const started = performance.now()
    for (let run = 0; run < runs; run += 1) checker.check(campus())
    const average = (performance.now() - started) / runs
    console.info(`RequirementChecker: ${state.devices.length} devices, ${requirements.length} requirements, ${average.toFixed(1)} ms per check`)
    expect(average).toBeLessThan(600)
  })
})
