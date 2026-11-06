import { describe, expect, it } from 'vitest'
import type { DesignRequirement, Device, NetworkState, StaticRoute } from '../domain'
import { accessMode, editLink, labCloud, labHost, labLink, labRouter, labSwitch } from '../engine/testLabs'
import { RequirementChecker, type DesignRules } from './RequirementChecker'

const DEFAULT_ROUTE: StaticRoute = { prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }

function edgeRouter(id: string, lan: string): Device {
  return labRouter(id, [{ id: 'Gi0/0', ip: lan }, { id: 'Gi0/1', addressing: 'dhcp' }], [DEFAULT_ROUTE])
}

/**
 * Office and guest networks on two routers sharing one ISP (the pre-ACL way to isolate guests):
 * office a1, a2 192.168.10.0/24 behind `officeRouter`/`officeSwitch`; guests g1, g2 192.168.20.0/24
 * behind `guestRouter`/`guestSwitch`.
 */
function twoNetworks(): NetworkState {
  const host = (id: string, ip: string, gateway: string) => labHost(id, ip, { gateway })
  return {
    devices: [
      labCloud('isp'),
      edgeRouter('officeRouter', '192.168.10.1'),
      edgeRouter('guestRouter', '192.168.20.1'),
      labSwitch('officeSwitch', [accessMode(1), accessMode(1), accessMode(1)]),
      labSwitch('guestSwitch', [accessMode(1), accessMode(1), accessMode(1)]),
      host('a1', '192.168.10.11', '192.168.10.1'),
      host('a2', '192.168.10.12', '192.168.10.1'),
      host('g1', '192.168.20.11', '192.168.20.1'),
      host('g2', '192.168.20.12', '192.168.20.1'),
    ],
    links: [
      labLink('officeWan', ['isp', 'eth0'], ['officeRouter', 'Gi0/1']),
      labLink('guestWan', ['isp', 'eth1'], ['guestRouter', 'Gi0/1']),
      labLink('officeUplink', ['officeRouter', 'Gi0/0'], ['officeSwitch', 'Fa0/1']),
      labLink('guestUplink', ['guestRouter', 'Gi0/0'], ['guestSwitch', 'Fa0/1']),
      labLink('a1Link', ['a1', 'eth0'], ['officeSwitch', 'Fa0/2']),
      labLink('a2Link', ['a2', 'eth0'], ['officeSwitch', 'Fa0/3']),
      labLink('g1Link', ['g1', 'eth0'], ['guestSwitch', 'Fa0/2']),
      labLink('g2Link', ['g2', 'eth0'], ['guestSwitch', 'Fa0/3']),
    ],
  }
}

function checkerFor(requirements: DesignRequirement[]): RequirementChecker {
  const rules: DesignRules = {
    lab: { state: { devices: [], links: [] } },
    groups: [
      { id: 'office', name: 'Office', deviceIds: ['a1', 'a2'] },
      { id: 'guests', name: 'Guests', deviceIds: ['g1', 'g2'] },
      { id: 'a1Only', name: 'a1', deviceIds: ['a1'] },
    ],
    requirements,
  }
  return new RequirementChecker(rules)
}

function okOf(requirement: DesignRequirement['condition'], state: NetworkState): boolean | undefined {
  return checkerFor([{ id: 'r', condition: requirement }]).check(state)[0]?.ok
}

describe('network conditions', () => {
  it('isolates guests from the office when both are online', () => {
    const lab = twoNetworks()
    expect(okOf({ type: 'notReachable', fromGroup: 'guests', toGroup: 'office' }, lab)).toBe(true)
    expect(okOf({ type: 'reachable', fromGroup: 'guests', toGroup: 'office' }, lab)).toBe(false)
    expect(okOf({ type: 'internet', group: 'guests' }, lab)).toBe(true)
  })

  it('does not count an offline group as isolated', () => {
    const lab = editLink(twoNetworks(), 'g1Link', (link) => ({ ...link, connected: false }))
    expect(okOf({ type: 'notReachable', fromGroup: 'guests', toGroup: 'office' }, lab)).toBe(false)
  })

  it('is not isolated when one router joins both networks', () => {
    const lab = twoNetworks()
    const joined: NetworkState = {
      devices: lab.devices.map((device) =>
        device.id === 'officeRouter'
          ? labRouter('officeRouter', [{ id: 'Gi0/0', ip: '192.168.10.1' }, { id: 'Gi0/1', addressing: 'dhcp' }, { id: 'Gi0/2', ip: '192.168.20.1' }], [DEFAULT_ROUTE])
          : device,
      ).filter((device) => device.id !== 'guestRouter'),
      links: [
        ...lab.links.filter((link) => link.id !== 'guestUplink' && link.id !== 'guestWan'),
        labLink('guestUplink', ['officeRouter', 'Gi0/2'], ['guestSwitch', 'Fa0/1']),
      ],
    }
    expect(okOf({ type: 'notReachable', fromGroup: 'guests', toGroup: 'office' }, joined)).toBe(false)
    expect(okOf({ type: 'separateSubnets', groupA: 'guests', groupB: 'office' }, joined)).toBe(true)
  })

  it('checks separate subnets and same segment', () => {
    const lab = twoNetworks()
    expect(okOf({ type: 'separateSubnets', groupA: 'office', groupB: 'guests' }, lab)).toBe(true)
    expect(okOf({ type: 'sameVlan', group: 'office' }, lab)).toBe(true)
    const wide = { ...lab, devices: lab.devices.map((device) => (device.id === 'g1' ? labHost('g1', '192.168.20.11', { mask: '255.255.0.0' }) : device)) }
    expect(okOf({ type: 'separateSubnets', groupA: 'office', groupB: 'guests' }, wide)).toBe(false)
    const split = { ...lab, devices: lab.devices.map((device) => (device.id === 'officeSwitch' ? labSwitch('officeSwitch', [accessMode(1), accessMode(1), accessMode(10)], [10]) : device)) }
    expect(okOf({ type: 'sameVlan', group: 'office' }, split)).toBe(false)
  })

  it('tries every single switch failure except the members’ own access switch', () => {
    // Office a1 on its own access switch behind a core switch; the office router hangs off the core.
    const lab = twoNetworks()
    const core = labSwitch('core', [accessMode(1), accessMode(1), accessMode(1)])
    const withCore: NetworkState = {
      devices: [...lab.devices, core],
      links: [
        ...lab.links.filter((link) => link.id !== 'officeUplink'),
        labLink('officeUplink', ['officeRouter', 'Gi0/0'], ['core', 'Fa0/1']),
        labLink('coreToAccess', ['core', 'Fa0/2'], ['officeSwitch', 'Fa0/1']),
      ],
    }
    const survivesSwitch: DesignRequirement['condition'] = {
      type: 'survivesFailure',
      failure: { scope: 'anyDevice', kinds: ['switch'] },
      requirement: { type: 'internet', group: 'a1Only' },
    }
    const [result] = checkerFor([{ id: 'r', condition: survivesSwitch }]).check(withCore)
    expect(result).toMatchObject({ ok: false, brokenBy: 'core' })
    // Without the core, only a1's own access switch is left, which is never tried.
    expect(okOf(survivesSwitch, lab)).toBe(true)
  })

  it('tries every single link failure between network devices', () => {
    const anyLink: DesignRequirement['condition'] = { type: 'survivesFailure', failure: { scope: 'anyLink' }, requirement: { type: 'reachable', fromGroup: 'a1Only', toGroup: 'office' } }
    // a1 → a2 crosses only member links: nothing to try, holds.
    expect(okOf(anyLink, twoNetworks())).toBe(true)
    const internet: DesignRequirement['condition'] = { type: 'survivesFailure', failure: { scope: 'anyLink' }, requirement: { type: 'internet', group: 'office' } }
    const [result] = checkerFor([{ id: 'r', condition: internet }]).check(twoNetworks())
    expect(result).toMatchObject({ ok: false, brokenBy: 'officeWan' })
  })
})
