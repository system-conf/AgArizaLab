import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { accessMode, editSwitchport, labHost, labLink, labSwitch, trunkMode } from '../../engine/testLabs'
import { RuntimeTables } from '../core/RuntimeTables'
import { SIM_TIMING } from '../contract'
import { actions, noteKeys, pingRequest, startLab } from './testStack'

/** pc1 .1, pc2 .2, pc3 .3 on switch Fa0/1–Fa0/3 (VLAN 1). */
function switchLab(): NetworkState {
  return {
    devices: [labHost('pc1', '10.0.0.1'), labHost('pc2', '10.0.0.2'), labHost('pc3', '10.0.0.3'), labSwitch('sw', [accessMode(1), accessMode(1), accessMode(1)])],
    links: [labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1']), labLink('l2', ['pc2', 'eth0'], ['sw', 'Fa0/2']), labLink('l3', ['pc3', 'eth0'], ['sw', 'Fa0/3'])],
  }
}

/** pc1 (VLAN 10) and pc3 (VLAN 20) on sw1, trunk Fa0/3 ↔ sw2 Fa0/1, pc2 (VLAN 10) and pc4 (VLAN 20) on sw2. */
function trunkLab(): NetworkState {
  return {
    devices: [
      labHost('pc1', '10.0.10.1'),
      labHost('pc2', '10.0.10.2'),
      labHost('pc3', '10.0.20.3'),
      labHost('pc4', '10.0.20.4'),
      labSwitch('sw1', [accessMode(10), accessMode(20), trunkMode()], [10, 20]),
      labSwitch('sw2', [trunkMode(), accessMode(10), accessMode(20)], [10, 20]),
    ],
    links: [
      labLink('l1', ['pc1', 'eth0'], ['sw1', 'Fa0/1']),
      labLink('l3', ['pc3', 'eth0'], ['sw1', 'Fa0/2']),
      labLink('trunk', ['sw1', 'Fa0/3'], ['sw2', 'Fa0/1']),
      labLink('l2', ['pc2', 'eth0'], ['sw2', 'Fa0/2']),
      labLink('l4', ['pc4', 'eth0'], ['sw2', 'Fa0/3']),
    ],
  }
}

/** pc1 .1 and pc2 .2 on a hub, the hub on switch Fa0/1, pc3 .3 on Fa0/2. */
function hubLab(): NetworkState {
  const passive = (id: string) => ({ id, medium: 'copper', role: 'passive', adminUp: true }) as const
  return {
    devices: [
      labHost('pc1', '10.0.0.1'),
      labHost('pc2', '10.0.0.2'),
      labHost('pc3', '10.0.0.3'),
      { id: 'hub', kind: 'hub', modelId: 'hub', name: 'hub', powered: true, baseMac: '02:00:00:FF:00:00', ports: ['p1', 'p2', 'p3'].map(passive) },
      labSwitch('sw', [accessMode(1), accessMode(1)]),
    ],
    links: [
      labLink('l1', ['pc1', 'eth0'], ['hub', 'p1']),
      labLink('l2', ['pc2', 'eth0'], ['hub', 'p2']),
      labLink('up', ['hub', 'p3'], ['sw', 'Fa0/1']),
      labLink('l3', ['pc3', 'eth0'], ['sw', 'Fa0/2']),
    ],
  }
}

function macOf(state: NetworkState, deviceId: string): string {
  return state.devices.find((device) => device.id === deviceId)?.baseMac ?? ''
}

describe('link layer: bridge', () => {
  it('floods the first ARP broadcast, learns both MACs and forwards the rest', () => {
    const lab = switchLab()
    const engine = startLab(lab)
    const id = engine.inject(pingRequest('pc1', '10.0.0.2'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.0.2' }] })
    expect(actions(run.events)).toEqual([
      'pc1 buffered',
      'pc1 created',
      'sw flooded',
      'pc2 replied',
      'pc2 created',
      'pc3 dropped arpNotForUs',
      'sw forwarded',
      'pc1 delivered',
      'pc1 sent',
      'sw forwarded',
      'pc2 replied',
      'pc2 created',
      'sw forwarded',
      'pc1 delivered',
    ])
    const flood = run.events[2]
    expect(flood).toMatchObject({ protocol: 'arp', layer: 2, inPortId: 'Fa0/1', outPortIds: ['Fa0/2', 'Fa0/3'] })
    expect(noteKeys(flood)).toEqual(['receivedOnPort', 'accessIngress', 'macLearned', 'broadcastFlooded', 'untaggedEgress', 'untaggedEgress'])
    expect(run.events[6]).toMatchObject({ outPortIds: ['Fa0/1'] })
    expect(noteKeys(run.events[6])).toContain('macKnown')
    const runtime = engine.runtime('sw')
    expect(runtime && RuntimeTables.macTable(runtime, engine.time).map((entry) => [entry.vlan, entry.mac, entry.portId])).toEqual([
      [1, macOf(lab, 'pc1'), 'Fa0/1'],
      [1, macOf(lab, 'pc2'), 'Fa0/2'],
    ])
  })

  it('repeats at a hub and filters a frame whose destination was learned on the ingress port', () => {
    const engine = startLab(hubLab())
    const id = engine.inject(pingRequest('pc1', '10.0.0.2'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.0.2' }] })
    const hub = run.events.find((event) => event.deviceId === 'hub')
    expect(hub).toMatchObject({ action: 'flooded', layer: 1, inPortId: 'p1', outPortIds: ['p2', 'p3'] })
    expect(noteKeys(hub)).toEqual(['receivedOnPort', 'hubRepeats', 'sentOnPort', 'sentOnPort'])
    const filtered = run.events.filter((event) => event.deviceId === 'sw' && event.action === 'filtered')
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered[0]).toMatchObject({ reason: 'sameSegment', layer: 2, outPortIds: [] })
    expect(noteKeys(filtered[0])).toContain('sameSegment')
  })

  it('stops a frame that comes back through a cabling loop', () => {
    const looped: NetworkState = {
      devices: [
        labHost('pc1', '10.0.0.1'),
        labHost('pc2', '10.0.0.2'),
        labSwitch('sw', [accessMode(1), accessMode(1), accessMode(1), accessMode(1)]),
        labSwitch('sw2', [accessMode(1), accessMode(1)]),
      ],
      links: [
        labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1']),
        labLink('l2', ['pc2', 'eth0'], ['sw', 'Fa0/2']),
        labLink('x1', ['sw', 'Fa0/3'], ['sw2', 'Fa0/1']),
        labLink('x2', ['sw2', 'Fa0/2'], ['sw', 'Fa0/4']),
      ],
    }
    const engine = startLab(looped)
    expect(engine.isIdle()).toBe(true)
    const ping = engine.inject(pingRequest('pc1', '10.0.0.2'))
    const result = engine.runUntilIdle()
    expect(result.stoppedBy).toBe('idle')
    expect(engine.request(ping)?.result).toMatchObject({ echoes: [{ kind: 'reply' }] })
    const loops = result.events.filter((event) => event.reason === 'l2Loop')
    expect(loops.map((event) => event.deviceId)).toEqual(['sw2', 'sw'])
    expect(noteKeys(loops[0])).toContain('loopSuppressed')
  })

  it('ages MAC entries out lazily and floods again', () => {
    const engine = startLab(switchLab())
    engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    engine.runUntil(engine.time + SIM_TIMING.macAgeMs + 1)
    const runtime = engine.runtime('sw')
    expect(runtime && RuntimeTables.macTable(runtime, engine.time)).toEqual([])
    const id = engine.inject(pingRequest('pc1', '10.0.0.2'))
    const run = engine.runUntilDone(id)
    // pc1's ARP entry aged out too (120 s): the request floods again; the echo to a forgotten MAC floods as unknown unicast.
    expect(actions(run.events).slice(0, 3)).toEqual(['pc1 buffered', 'pc1 created', 'sw flooded'])
  })

  it('keeps VLANs apart and tags frames on the trunk', () => {
    const engine = startLab(trunkLab())
    const id = engine.inject(pingRequest('pc1', '10.0.10.2'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.10.2' }] })
    const transmissions = run.transmissions.filter((transmission) => transmission.linkId === 'trunk')
    expect(transmissions.length).toBeGreaterThan(0)
    expect(transmissions.every((transmission) => transmission.frame.kind === 'ethernet' && transmission.frame.tag?.vid === 10)).toBe(true)
    expect(run.events.some((event) => event.deviceId === 'pc3' || event.deviceId === 'pc4')).toBe(false)
    const sw2 = run.events.find((event) => event.deviceId === 'sw2')
    expect(noteKeys(sw2)).toContain('trunkIngress')
    expect(sw2?.outPortIds).toEqual(['Fa0/2'])
  })

  it('sends the native VLAN untagged and drops VLANs the trunk does not allow', () => {
    let lab = editSwitchport(trunkLab(), 'sw1', 'Fa0/3', { nativeVlan: 10 })
    lab = editSwitchport(lab, 'sw2', 'Fa0/1', { nativeVlan: 10 })
    let engine = startLab(lab)
    let run = engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.10.2')))
    const onTrunk = run.transmissions.filter((transmission) => transmission.linkId === 'trunk')
    expect(onTrunk.every((transmission) => transmission.frame.kind === 'ethernet' && transmission.frame.tag === undefined)).toBe(true)
    expect(noteKeys(run.events.find((event) => event.deviceId === 'sw2'))).toContain('nativeIngress')

    lab = editSwitchport(trunkLab(), 'sw2', 'Fa0/1', { allowedVlans: [20] })
    engine = startLab(lab)
    const id = engine.inject(pingRequest('pc1', '10.0.10.2'))
    run = engine.runUntilDone(id)
    const sw2 = run.events.find((event) => event.deviceId === 'sw2')
    expect(sw2).toMatchObject({ action: 'dropped', reason: 'vlanNotAllowed' })
    expect(noteKeys(sw2)).toContain('vlanNotAllowed')
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'unreachable', fromIp: '10.0.10.1' }] })
  })

  it('drops tagged frames on access ports and frames of VLANs missing from the database', () => {
    let lab = editSwitchport(trunkLab(), 'sw1', 'Fa0/3', { mode: 'trunk' })
    lab = editSwitchport(lab, 'sw2', 'Fa0/1', { mode: 'access', accessVlan: 10 })
    let engine = startLab(lab)
    let run = engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.10.2')))
    expect(run.events.find((event) => event.deviceId === 'sw2')).toMatchObject({ action: 'dropped', reason: 'vlanNotAllowed' })
    expect(noteKeys(run.events.find((event) => event.deviceId === 'sw2'))).toContain('taggedOnAccess')

    lab = editSwitchport(trunkLab(), 'sw1', 'Fa0/1', { accessVlan: 30 })
    engine = startLab(lab)
    run = engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.10.2')))
    expect(run.events.find((event) => event.deviceId === 'sw1')).toMatchObject({ action: 'dropped', reason: 'vlanInactive' })
  })
})
