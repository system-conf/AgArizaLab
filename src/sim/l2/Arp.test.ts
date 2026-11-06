import { describe, expect, it } from 'vitest'
import type { Device, NetworkState } from '../../domain'
import { accessMode, editAddress, editLink, editPort, labCloud, labHost, labLink, labRouter, labSwitch, trunkMode } from '../../engine/testLabs'
import { RuntimeTables } from '../core/RuntimeTables'
import { SimulationKernel } from '../core/SimulationKernel'
import type { DeviceContext, NetworkLayer, SimLayers, SimRequest } from '../contract'
import { actions, linkTestLayers, noteKeys, pingRequest, startLab } from './testStack'

/** Hosts with the given addresses on switch ports Fa0/1… (VLAN 1), plus extra devices / links. */
function lanLab(addresses: string[], extra: Device[] = []): NetworkState {
  const hosts = addresses.map((address, index) => labHost(`pc${index + 1}`, address))
  const sw = labSwitch('sw', [...hosts, ...extra].map(() => accessMode(1)))
  return {
    devices: [...hosts, ...extra, sw],
    links: [...hosts, ...extra].map((device, index) => labLink(`l${index + 1}`, [device.id, device.ports[0]?.id ?? ''], ['sw', `Fa0/${index + 1}`])),
  }
}

/** A network layer whose 'ping' reports LinkLayer.interfaceReady(targetIp as interface id) as the echo. */
const readinessNetwork: NetworkLayer = {
  ...linkTestLayers.network,
  onStart: () => undefined,
  onChange: () => undefined,
  onTimer: () => undefined,
  onPacket: (ctx, delivery) => linkTestLayers.network.onPacket(ctx, delivery),
  send: (ctx, request) => linkTestLayers.network.send(ctx, request),
  onUndeliverable: () => undefined,
  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest) {
    if (request.kind !== 'ping') return
    const ready = ctx.layers.link.interfaceReady(ctx, request.targetIp)
    const reason = ready.ok ? 'unsupported' : ready.reason
    ctx.report(requestId, { kind: 'ping', echoes: [{ kind: 'localFailure', sequence: 1, reason }] }, true)
  },
}

function readiness(lab: NetworkState, deviceId: string, interfaceId: string): string {
  const layers: SimLayers = { ...linkTestLayers, network: readinessNetwork }
  const engine = SimulationKernel.create(lab, layers)
  const id = engine.inject(pingRequest(deviceId, interfaceId))
  engine.runUntilDone(id)
  const result = engine.request(id)?.result
  if (result?.kind !== 'ping' || result.echoes[0]?.kind !== 'localFailure') throw new Error('no readiness')
  return result.echoes[0].reason === 'unsupported' ? 'ok' : result.echoes[0].reason
}

describe('link layer: ARP', () => {
  it('caches the neighbour: the second ping needs no ARP; the target learned the asker from its request', () => {
    const engine = startLab(lanLab(['10.0.0.1', '10.0.0.2']))
    engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    const pc2 = engine.runtime('pc2')
    expect(pc2 && RuntimeTables.arp(pc2, engine.time).map((entry) => [entry.interfaceId, entry.ip, entry.state])).toEqual([['eth0', '10.0.0.1', 'reachable']])
    const run = engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    expect(actions(run.events)).toEqual(['pc1 created', 'sw forwarded', 'pc2 replied', 'pc2 created', 'sw forwarded', 'pc1 delivered'])
    expect(noteKeys(run.events[0])).toContain('arpCacheHit')
    const entry = engine.runtime('pc1')?.link.arp[0]
    expect(entry).toMatchObject({ ip: '10.0.0.2', state: 'reachable', type: 'dynamic', attempts: 1 })
    expect(entry?.expiresAt).toBe((entry?.updatedAt ?? 0) + 120_000)
  })

  it('queues packets behind one ARP request and releases them in order with new frame ids', () => {
    const engine = startLab(lanLab(['10.0.0.1', '10.0.0.2']))
    const first = engine.inject(pingRequest('pc1', '10.0.0.2'))
    const second = engine.inject(pingRequest('pc1', '10.0.0.2'))
    const run = engine.runUntilIdle()
    expect(engine.request(first)?.status).toBe('done')
    expect(engine.request(second)?.status).toBe('done')
    const atPc1 = run.events.filter((event) => event.deviceId === 'pc1')
    expect(atPc1.slice(0, 3).map((event) => event.action)).toEqual(['buffered', 'created', 'buffered'])
    expect(noteKeys(atPc1[2])).toContain('arpAlreadyPending')
    const sent = atPc1.filter((event) => event.action === 'sent')
    expect(sent.map((event) => event.flowId)).toEqual([first, second])
    expect(sent.map((event) => event.causeEventId)).toEqual([atPc1[0]?.id, atPc1[2]?.id])
    expect(run.events.filter((event) => event.protocol === 'arp' && event.action === 'created')).toHaveLength(2)
  })

  it('does not answer for a network address and refuses ARP requests for other addresses', () => {
    const engine = startLab(lanLab(['10.0.0.1', '10.0.0.0']))
    const run = engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.0')))
    const refusal = run.events.find((event) => event.deviceId === 'pc2')
    expect(refusal).toMatchObject({ action: 'dropped', reason: 'arpNotForUs' })
    expect(noteKeys(refusal)).toContain('arpCannotAnswer')
  })

  it('clears ARP caches and MAC tables on request', () => {
    const engine = startLab(lanLab(['10.0.0.1', '10.0.0.2']))
    engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.0.2')))
    const arp = engine.inject({ kind: 'clearTable', deviceId: 'pc1', table: 'arp' })
    const mac = engine.inject({ kind: 'clearTable', deviceId: 'sw', table: 'mac' })
    engine.runUntilIdle()
    expect(engine.request(arp)?.result).toEqual({ kind: 'cleared', entries: 1 })
    expect(engine.request(mac)?.result).toEqual({ kind: 'cleared', entries: 2 })
    expect(engine.runtime('pc1')?.link.arp).toEqual([])
    expect(engine.runtime('sw')?.link.macTable).toEqual([])
  })

  it('bridges Wi-Fi clients into their SSID VLAN and sends unicast only to the addressed client', () => {
    const laptop = (id: string, ip: string) => labHost(id, ip, { kind: 'laptop', nic: { id: 'wlan0', medium: 'wireless' } })
    const ap: Device = {
      id: 'ap',
      kind: 'accessPoint',
      modelId: 'accessPoint',
      name: 'ap',
      powered: true,
      baseMac: '02:00:00:AA:00:00',
      ports: [
        { id: 'Gi0', medium: 'copper', role: 'switched', adminUp: true, mac: '02:00:00:AA:00:01', l2: trunkMode() },
        { id: 'Radio0', medium: 'wireless', role: 'radio', adminUp: true, mac: '02:00:00:AA:00:02' },
      ],
      wireless: { ssids: [{ ssid: 'Staff', vlan: 10, security: { mode: 'open' } }, { ssid: 'Guest', vlan: 20, security: { mode: 'open' } }] },
    }
    const lab: NetworkState = {
      devices: [laptop('lap1', '10.0.10.1'), laptop('lap2', '10.0.10.2'), laptop('lap3', '10.0.20.3'), labHost('pc', '10.0.10.9'), ap, labSwitch('sw', [trunkMode(), accessMode(10)], [10, 20])],
      links: [
        labLink('w1', ['lap1', 'wlan0'], ['ap', 'Radio0'], { cable: 'wireless', ssid: 'Staff' }),
        labLink('w2', ['lap2', 'wlan0'], ['ap', 'Radio0'], { cable: 'wireless', ssid: 'Staff' }),
        labLink('w3', ['lap3', 'wlan0'], ['ap', 'Radio0'], { cable: 'wireless', ssid: 'Guest' }),
        labLink('up', ['ap', 'Gi0'], ['sw', 'Fa0/1']),
        labLink('l1', ['pc', 'eth0'], ['sw', 'Fa0/2']),
      ],
    }
    const engine = startLab(lab)
    const id = engine.inject(pingRequest('lap1', '10.0.10.2'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.10.2' }] })
    const flood = run.events.find((event) => event.deviceId === 'ap')
    expect(noteKeys(flood)).toEqual(expect.arrayContaining(['ssidIngress', 'taggedEgress', 'radioEgress']))
    const floodCopies = run.transmissions.filter((transmission) => transmission.eventId === flood?.id).map((transmission) => transmission.linkId)
    expect(floodCopies).toEqual(['up', 'w2'])
    expect(run.events.some((event) => event.deviceId === 'lap3')).toBe(false)
    const toLap1 = run.transmissions.filter((transmission) => transmission.to.deviceId === 'lap1')
    expect(toLap1.length).toBeGreaterThan(0)
    expect(run.transmissions.filter((transmission) => transmission.to.deviceId === 'lap2' && transmission.protocol === 'icmp')).toHaveLength(1)
    expect(run.transmissions.filter((transmission) => transmission.linkId === 'w3')).toEqual([])

    const wired = engine.inject(pingRequest('lap1', '10.0.10.9'))
    engine.runUntilDone(wired)
    expect(engine.request(wired)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.10.9' }] })
  })
})

describe('link layer: duplicate address detection', () => {
  it('both NICs that share an address lose it; nobody answers for it', () => {
    const engine = startLab(lanLab(['10.0.0.1', '10.0.0.1', '10.0.0.3']))
    expect(engine.runtime('pc1')?.link.claims).toEqual([{ interfaceId: 'eth0', address: '10.0.0.1', duplicate: true, probedAt: 0 }])
    expect(engine.runtime('pc2')?.link.claims[0]?.duplicate).toBe(true)
    expect(engine.runtime('pc3')?.link.claims[0]?.duplicate).toBe(false)
    const own = engine.inject(pingRequest('pc1', '10.0.0.3'))
    engine.runUntilDone(own)
    expect(engine.request(own)?.result).toMatchObject({ echoes: [{ kind: 'localFailure', reason: 'ipConflict' }] })
    const other = engine.inject(pingRequest('pc3', '10.0.0.1'))
    engine.runUntilDone(other)
    expect(engine.request(other)?.result).toMatchObject({ echoes: [{ kind: 'unreachable' }] })
  })

  it('shows the probes and the defence without settle', () => {
    const engine = startLab(lanLab(['10.0.0.1', '10.0.0.1']), { settle: false })
    engine.runUntilIdle()
    const events = engine.events()
    const probes = events.filter((event) => event.action === 'created' && noteKeys(event).includes('arpProbe'))
    expect(probes.map((event) => [event.deviceId, event.flowId])).toEqual([['pc1', 'boot'], ['pc2', 'boot']])
    const defences = events.filter((event) => event.action === 'replied')
    expect(defences.map((event) => event.deviceId)).toEqual(['pc2', 'pc1'])
    expect(noteKeys(defences[0])).toEqual(expect.arrayContaining(['probeForOurAddress', 'addressConflict']))
  })

  it('a router interface defends its address and keeps it; DHCP addresses are not probed', () => {
    const router = labRouter('r1', [{ id: 'Gi0/0', ip: '10.0.0.254' }])
    let lab = lanLab(['10.0.0.254', '10.0.0.3'], [router])
    lab = editAddress(lab, 'pc2', 'eth0', { addressing: 'dhcp' })
    const engine = startLab(lab, { settle: false })
    engine.runUntilIdle()
    expect(engine.events().filter((event) => noteKeys(event).includes('arpProbe')).map((event) => event.deviceId)).toEqual(['pc1'])
    expect(engine.runtime('pc2')?.link.claims).toEqual([{ interfaceId: 'eth0', address: '10.0.0.3', duplicate: false, probedAt: 0 }])
    expect(engine.runtime('pc1')?.link.claims[0]?.duplicate).toBe(true)
    expect(engine.runtime('r1')?.link.claims).toEqual([])
    expect(noteKeys(engine.events().find((event) => event.deviceId === 'r1'))).toContain('addressDefended')
    const ping = engine.inject(pingRequest('pc2', '10.0.0.254'))
    engine.runUntilDone(ping)
    expect(engine.request(ping)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.0.254' }] })
  })
})

describe('link layer: interfaceReady', () => {
  it('reports link, port and conflict problems in the engine order', () => {
    const lab = lanLab(['10.0.0.1', '10.0.0.2'])
    expect(readiness(lab, 'pc1', 'eth0')).toBe('ok')
    expect(readiness(editPort(lab, 'pc1', 'eth0', (port) => ({ ...port, adminUp: false })), 'pc1', 'eth0')).toBe('portDisabled')
    expect(readiness(editLink(lab, 'l1', (link) => ({ ...link, connected: false })), 'pc1', 'eth0')).toBe('cableDisconnected')
    expect(readiness(lanLab(['10.0.0.1', '10.0.0.1']), 'pc1', 'eth0')).toBe('ipConflict')
    expect(readiness(lab, 'pc1', 'eth9')).toBe('invalidConfig')
    const wan: NetworkState = {
      devices: [labRouter('r1', [{ id: 'Gi0/1', addressing: 'dhcp' }]), labCloud('internet', { eth0: false })],
      links: [labLink('wan', ['r1', 'Gi0/1'], ['internet', 'eth0'])],
    }
    expect(readiness(wan, 'internet', 'eth0')).toBe('ispServiceDown')
    expect(readiness(wan, 'internet', 'eth1')).toBe('cableDisconnected')
    expect(readiness(wan, 'r1', 'Gi0/1')).toBe('ok')
  })
})
