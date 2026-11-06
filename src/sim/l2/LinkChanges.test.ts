import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { accessMode, editAddress, editDevice, editLink, editSwitchport, labHost, labLink, labSwitch } from '../../engine/testLabs'
import { RuntimeTables } from '../core/RuntimeTables'
import { noteKeys, pingRequest, startLab } from './testStack'

/** pc1 .1, pc2 .2 (VLAN 1) and pc3 .3 (VLAN 10) on one switch. */
function lab(): NetworkState {
  return {
    devices: [labHost('pc1', '10.0.0.1'), labHost('pc2', '10.0.0.2'), labHost('pc3', '10.0.0.3'), labSwitch('sw', [accessMode(1), accessMode(1), accessMode(10)], [10])],
    links: [labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1']), labLink('l2', ['pc2', 'eth0'], ['sw', 'Fa0/2']), labLink('l3', ['pc3', 'eth0'], ['sw', 'Fa0/3'])],
  }
}

function macPorts(engine: ReturnType<typeof startLab>, deviceId = 'sw'): string[] {
  const runtime = engine.runtime(deviceId)
  return runtime ? RuntimeTables.macTable(runtime, engine.time).map((entry) => `${entry.vlan} ${entry.portId}`) : []
}

describe('link layer: start-up and flush rules', () => {
  it('starts from empty MAC tables and ARP caches after settle, keeping duplicate-address results', () => {
    const state = lab()
    const engine = startLab(editAddress(state, 'pc2', 'eth0', { address: '10.0.0.1' }))
    expect(engine.events()).toEqual([])
    expect(engine.time).toBeGreaterThan(0)
    for (const device of engine.network().devices) {
      expect(engine.runtime(device.id)?.link.macTable).toEqual([])
      expect(engine.runtime(device.id)?.link.arp).toEqual([])
      expect(engine.runtime(device.id)?.link.pending).toEqual([])
    }
    expect(engine.runtime('pc1')?.link.claims[0]?.duplicate).toBe(true)
  })

  it('does not keep what start-up traffic taught, but learns from it later', () => {
    const engine = startLab(lab(), { settle: false })
    engine.runUntilIdle()
    expect(engine.events().every((event) => event.flowId === 'boot')).toBe(true)
    expect(macPorts(engine)).toEqual([])
    const plugged = editLink(engine.network(), 'l3', (link) => ({ ...link, connected: false }))
    engine.reconfigure(plugged)
    const report = engine.reconfigure(editLink(plugged, 'l3', (link) => ({ ...link, connected: true })))
    expect(report.events.map((event) => [event.deviceId, event.flowId])).toEqual([['pc3', 'bg:pc3']])
    expect(noteKeys(report.events[0])).toContain('arpProbe')
    engine.runUntilIdle()
    expect(macPorts(engine)).toEqual(['10 Fa0/3'])
  })

  it('forgets MAC and ARP entries of a port that goes down and drops the packets waiting there', () => {
    const engine = startLab(lab())
    engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    expect(macPorts(engine)).toEqual(['1 Fa0/1', '1 Fa0/2'])
    const id = engine.inject(pingRequest('pc1', '10.0.0.9'))
    engine.step()
    expect(engine.runtime('pc1')?.link.pending).toHaveLength(1)
    const report = engine.reconfigure(editLink(engine.network(), 'l1', (link) => ({ ...link, connected: false })))
    expect(macPorts(engine)).toEqual(['1 Fa0/2'])
    expect(engine.runtime('pc1')?.link.arp).toEqual([])
    expect(engine.runtime('pc1')?.link.pending).toEqual([])
    const drop = report.events.find((event) => event.deviceId === 'pc1')
    expect(drop).toMatchObject({ action: 'dropped', reason: 'linkDown', flowId: id })
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'unreachable' }] })
    engine.runUntilIdle()
  })

  it('forgets MAC entries of a port whose VLAN settings change and of a removed VLAN', () => {
    const engine = startLab(lab())
    engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    engine.reconfigure(editSwitchport(engine.network(), 'sw', 'Fa0/2', { accessVlan: 10 }))
    expect(macPorts(engine)).toEqual(['1 Fa0/1'])
    engine.reconfigure(editSwitchport(engine.network(), 'sw', 'Fa0/2', { accessVlan: 1 }))
    engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    expect(macPorts(engine)).toEqual(['1 Fa0/1', '1 Fa0/2'])
    const sw = engine.network().devices.find((device) => device.id === 'sw')
    expect(sw?.switching).toBeDefined()
    engine.reconfigure(
      editDevice(engine.network(), 'sw', (device) =>
        device.switching ? { ...device, switching: { ...device.switching, vlans: device.switching.vlans.filter((vlan) => vlan.id !== 1) } } : device,
      ),
    )
    expect(macPorts(engine)).toEqual([])
  })

  it('a new address forgets the interface ARP entries and probes again', () => {
    const engine = startLab(lab())
    engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    expect(engine.runtime('pc1')?.link.arp).toHaveLength(1)
    const report = engine.reconfigure(editAddress(engine.network(), 'pc1', 'eth0', { address: '10.0.0.2' }))
    expect(engine.runtime('pc1')?.link.arp).toEqual([])
    expect(report.events.map((event) => [event.deviceId, event.action])).toEqual([['pc1', 'created']])
    engine.runUntilIdle()
    expect(engine.runtime('pc1')?.link.claims[0]).toMatchObject({ address: '10.0.0.2', duplicate: true })
    expect(engine.runtime('pc2')?.link.claims[0]).toMatchObject({ address: '10.0.0.2', duplicate: true })
    engine.reconfigure(editAddress(engine.network(), 'pc1', 'eth0', { address: '10.0.0.7' }))
    engine.runUntilIdle()
    expect(engine.runtime('pc1')?.link.claims[0]).toMatchObject({ address: '10.0.0.7', duplicate: false })
  })

  it('is deterministic: the same lab and calls give the same events', () => {
    const state = lab()
    const run = () => {
      const engine = startLab(state, { settle: false })
      engine.inject(pingRequest('pc1', '10.0.0.2'))
      engine.inject(pingRequest('pc2', '10.0.0.9'))
      engine.runUntilIdle()
      return JSON.stringify({ events: engine.events(), transmissions: engine.transmissions(), runtime: engine.snapshot().devices })
    }
    expect(run()).toBe(run())
  })
})
