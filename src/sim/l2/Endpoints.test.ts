import { describe, expect, it } from 'vitest'
import type { Device, NetworkState, Port } from '../../domain'
import { accessMode, editSwitchport, labCloud, labHost, labLink, labRouter, labSwitch, trunkMode } from '../../engine/testLabs'
import { actions, noteKeys, pingRequest, startLab } from './testStack'

/** Router-on-a-stick: pc1 VLAN 10, pc3 VLAN 20, pc5 VLAN 30 on sw; trunk Fa0/4 ↔ router Gi0/0 (.10, .20). */
function stickLab(): NetworkState {
  return {
    devices: [
      labHost('pc1', '10.0.10.1', { gateway: '10.0.10.254' }),
      labHost('pc3', '10.0.20.3', { gateway: '10.0.20.254' }),
      labHost('pc5', '10.0.30.5', { gateway: '10.0.30.254' }),
      labSwitch('sw', [accessMode(10), accessMode(20), accessMode(30), trunkMode()], [10, 20, 30]),
      labRouter('r1', [{ id: 'Gi0/0', subInterfaces: [{ vlan: 10, ip: '10.0.10.254' }, { vlan: 20, ip: '10.0.20.254' }] }]),
    ],
    links: [
      labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1']),
      labLink('l3', ['pc3', 'eth0'], ['sw', 'Fa0/2']),
      labLink('l5', ['pc5', 'eth0'], ['sw', 'Fa0/3']),
      labLink('trunk', ['sw', 'Fa0/4'], ['r1', 'Gi0/0']),
    ],
  }
}

/** L3 switch with ip routing and SVIs Vlan10 / Vlan20; pc1, pc2 in VLAN 10, pc3 in VLAN 20. */
function sviLab(): NetworkState {
  const base = labSwitch('mls', [accessMode(10), accessMode(10), accessMode(20)], [10, 20], 'l3Switch')
  const svi = (vlan: number, address: string) => ({ vlan, adminUp: true, l3: { ipv4: { addressing: 'static', address, mask: '255.255.255.0' } } }) as const
  const mls: Device = {
    ...base,
    switching: { vlans: base.switching?.vlans ?? [], svis: [svi(10, '10.0.10.254'), svi(20, '10.0.20.254')], defaultGateway: '' },
    routing: { ipRouting: true, staticRoutes: [] },
  }
  return {
    devices: [labHost('pc1', '10.0.10.1', { gateway: '10.0.10.254' }), labHost('pc2', '10.0.10.2'), labHost('pc3', '10.0.20.3', { gateway: '10.0.20.254' }), mls],
    links: [labLink('l1', ['pc1', 'eth0'], ['mls', 'Fa0/1']), labLink('l2', ['pc2', 'eth0'], ['mls', 'Fa0/2']), labLink('l3', ['pc3', 'eth0'], ['mls', 'Fa0/3'])],
  }
}

/** pc .1 behind r1 Gi0/0 (.254); r1 WAN Gi0/1 (no address) on the cloud's eth0. */
function wanLab(serviceUp = true): NetworkState {
  return {
    devices: [
      labHost('pc', '10.0.0.1', { gateway: '10.0.0.254' }),
      labRouter('r1', [{ id: 'Gi0/0', ip: '10.0.0.254' }, { id: 'Gi0/1', addressing: 'dhcp' }]),
      labCloud('internet', { eth0: serviceUp }),
    ],
    links: [labLink('lan', ['pc', 'eth0'], ['r1', 'Gi0/0']), labLink('wan', ['r1', 'Gi0/1'], ['internet', 'eth0'])],
  }
}

function serialPort(address: string): Port {
  return { id: 'Se0/0/0', medium: 'serial', role: 'routed', adminUp: true, l3: { ipv4: { addressing: 'static', address, mask: '255.255.255.252' } }, subInterfaces: [], serial: { clockRate: 64000 } }
}

describe('link layer: endpoints', () => {
  it('demultiplexes 802.1Q tags to sub-interfaces and tags what a sub-interface sends', () => {
    const engine = startLab(stickLab())
    const id = engine.inject(pingRequest('pc1', '10.0.20.3'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.20.3' }] })
    const atRouter = run.events.filter((event) => event.deviceId === 'r1')
    expect(noteKeys(atRouter[0])).toContain('subInterfaceIngress')
    expect(atRouter.map((event) => `${event.action} ${event.layer}`)).toEqual([
      'replied 2', // ARP for the gateway on Gi0/0.10
      'created 2', // the ARP reply, tagged 10
      'buffered 3', // the echo waits for ARP of 10.0.20.3 on Gi0/0.20
      'created 2', // ARP request, tagged 20
      'delivered 2', // ARP reply from pc3
      'sent 3', // the echo leaves with a new frame id
      'forwarded 3', // the echo reply is routed at once: pc3 learned the gateway from the router's request
    ])
    const buffered = atRouter[2]
    const sent = atRouter[5]
    expect(sent?.causeEventId).toBe(buffered?.id)
    expect(sent?.pduId).toBe(buffered?.pduId)
    expect(sent?.frameId).not.toBe(buffered?.frameId)
    const trunkTags = run.transmissions
      .filter((transmission) => transmission.linkId === 'trunk')
      .map((transmission) => (transmission.frame.kind === 'ethernet' ? (transmission.frame.tag?.vid ?? 0) : -1))
    expect(new Set(trunkTags)).toEqual(new Set([10, 20]))
  })

  it('drops a tag without a sub-interface; the waiting packet times out after three ARP requests', () => {
    const engine = startLab(stickLab())
    const start = engine.time
    const id = engine.inject(pingRequest('pc5', '10.0.10.1'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'unreachable', fromIp: '10.0.30.5', code: 'host' }] })
    const atRouter = run.events.filter((event) => event.deviceId === 'r1')
    expect(atRouter.map((event) => event.reason)).toEqual(['noSubInterface', 'noSubInterface', 'noSubInterface'])
    expect(noteKeys(atRouter[0])).toContain('noSubInterface')
    const arpRequests = run.events.filter((event) => event.deviceId === 'pc5' && event.action === 'created')
    expect(arpRequests.map((event) => event.time - start)).toEqual([0, 1000, 2000])
    expect(noteKeys(arpRequests[1])).toContain('arpRetry')
    const drop = run.events.find((event) => event.deviceId === 'pc5' && event.action === 'dropped')
    expect(drop).toMatchObject({ reason: 'arpTimeout', time: start + 3000, protocol: 'icmp' })
    expect(engine.runtime('pc5')?.link.pending).toEqual([])
    expect(engine.runtime('pc5')?.link.arp).toEqual([])
  })

  it('hands untagged frames to the native sub-interface', () => {
    const state = stickLab()
    const lab: NetworkState = {
      ...state,
      devices: state.devices.map((device) =>
        device.id === 'r1' ? labRouter('r1', [{ id: 'Gi0/0', subInterfaces: [{ vlan: 10, ip: '10.0.10.254', native: true }, { vlan: 20, ip: '10.0.20.254' }] }]) : device,
      ),
    }
    const withNative = editSwitchport(editSwitchport(lab, 'sw', 'Fa0/4', { nativeVlan: 10 }), 'sw', 'Fa0/1', { accessVlan: 10 })
    const engine = startLab(withNative)
    const id = engine.inject(pingRequest('pc1', '10.0.10.254'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.10.254' }] })
    expect(noteKeys(run.events.find((event) => event.deviceId === 'r1'))).toContain('nativeSubInterface')
    const fromRouter = run.transmissions.filter((transmission) => transmission.from.deviceId === 'r1')
    expect(fromRouter.every((transmission) => transmission.frame.kind === 'ethernet' && transmission.frame.tag === undefined)).toBe(true)
  })

  it('answers on the management SVI of a layer-2 switch, which also probes its address', () => {
    const base = labSwitch('sw', [accessMode(1)])
    const sw: Device = {
      ...base,
      switching: { vlans: base.switching?.vlans ?? [], svis: [{ vlan: 1, adminUp: true, l3: { ipv4: { addressing: 'static', address: '10.0.0.250', mask: '255.255.255.0' } } }], defaultGateway: '' },
    }
    const engine = startLab({ devices: [labHost('pc1', '10.0.0.1'), sw], links: [labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1'])] })
    expect(engine.runtime('sw')?.link.claims).toEqual([{ interfaceId: 'Vlan1', address: '10.0.0.250', duplicate: false, probedAt: 0 }])
    const id = engine.inject(pingRequest('pc1', '10.0.0.250'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.0.250' }] })
    expect(noteKeys(run.events.find((event) => event.deviceId === 'sw' && event.protocol === 'icmp'))).toContain('sviDelivered')
  })

  it('routes between SVIs; a broadcast for the SVI is flooded in its VLAN and answered', () => {
    const engine = startLab(sviLab())
    const id = engine.inject(pingRequest('pc1', '10.0.20.3'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.0.20.3' }] })
    const arpForSvi = run.events.find((event) => event.deviceId === 'mls')
    expect(arpForSvi).toMatchObject({ action: 'replied', inPortId: 'Fa0/1', outPortIds: ['Fa0/2'] })
    expect(noteKeys(arpForSvi)).toEqual(expect.arrayContaining(['broadcastFlooded', 'sviCopy', 'arpRequestForUs']))
    const sviReply = run.events.find((event) => event.deviceId === 'mls' && event.action === 'created')
    expect(sviReply?.outPortIds).toEqual(['Fa0/1'])
    expect(sviReply?.outbound).toMatchObject({ kind: 'ethernet', src: engine.network().devices[3]?.baseMac })
    expect(run.events.some((event) => event.deviceId === 'mls' && event.action === 'buffered' && event.layer === 3)).toBe(true)
    expect(run.events.find((event) => event.deviceId === 'pc2')).toMatchObject({ action: 'dropped', reason: 'arpNotForUs' })
  })

  it('keeps the flood when the SVI does not use its copy of a broadcast', () => {
    const engine = startLab(sviLab())
    const run = engine.runUntilDone(engine.inject(pingRequest('pc1', '10.0.10.2')))
    const flood = run.events.find((event) => event.deviceId === 'mls')
    expect(flood).toMatchObject({ action: 'flooded', outPortIds: ['Fa0/2'] })
    expect(noteKeys(flood)).toEqual(expect.arrayContaining(['sviCopy', 'sviCopyDiscarded', 'arpNotForUs']))
  })

  it('speaks HDLC on serial links, without ARP', () => {
    const r1 = labRouter('r1', [])
    const r2 = labRouter('r2', [])
    const lab: NetworkState = {
      devices: [{ ...r1, ports: [serialPort('10.1.1.1')] }, { ...r2, ports: [serialPort('10.1.1.2')] }],
      links: [labLink('wan', ['r1', 'Se0/0/0'], ['r2', 'Se0/0/0'], { cable: 'serial', dceEnd: 'a' })],
    }
    const engine = startLab(lab)
    const id = engine.inject(pingRequest('r1', '10.1.1.2'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '10.1.1.2' }] })
    expect(actions(run.events)).toEqual(['r1 created', 'r2 replied', 'r2 created', 'r1 delivered'])
    expect(run.transmissions.every((transmission) => transmission.frame.kind === 'hdlc' && transmission.protocol === 'icmp')).toBe(true)
    expect(noteKeys(run.events[0])).toContain('hdlcEncapsulated')
    expect(noteKeys(run.events[1])).toContain('hdlcReceived')
  })
})

describe('link layer: the internet cloud', () => {
  it('answers ARP for public addresses (proxy ARP) and returns traffic to the asking MAC', () => {
    const engine = startLab(wanLab())
    const id = engine.inject(pingRequest('r1', '8.8.8.8'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply', fromIp: '8.8.8.8' }] })
    const proxy = run.events.find((event) => event.deviceId === 'internet')
    expect(proxy).toMatchObject({ action: 'replied', protocol: 'arp' })
    expect(noteKeys(proxy)).toContain('cloudProxyArp')
    const arpRequest = run.events.find((event) => event.deviceId === 'r1' && event.protocol === 'arp')
    expect(arpRequest?.outbound).toMatchObject({ payload: { senderIp: '0.0.0.0', targetIp: '8.8.8.8' } })
  })

  it('does not answer for private addresses', () => {
    const engine = startLab(wanLab())
    const id = engine.inject(pingRequest('r1', '192.168.50.1'))
    const run = engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'unreachable' }] })
    expect(run.events.filter((event) => event.deviceId === 'internet').map((event) => event.reason)).toEqual(['arpNotForUs', 'arpNotForUs', 'arpNotForUs'])
  })

  it('drops IPv4 silently while the provider line is down (ARP still answered), and serves only routed ports', () => {
    let engine = startLab(wanLab(false))
    const id = engine.inject(pingRequest('r1', '8.8.8.8'))
    let run = engine.runUntilDone(id)
    const atCloud = run.events.filter((event) => event.deviceId === 'internet')
    expect(atCloud[0]).toMatchObject({ action: 'replied', protocol: 'arp' })
    const down = atCloud.find((event) => event.protocol === 'icmp')
    expect(down).toMatchObject({ action: 'dropped', reason: 'ispServiceDown' })
    expect(noteKeys(down)).toContain('ispServiceDown')
    expect(run.events.filter((event) => event.deviceId === 'r1' && event.action === 'dropped')).toEqual([])

    const direct: NetworkState = { devices: [labHost('pc', '1.2.3.4'), labCloud()], links: [labLink('wan', ['pc', 'eth0'], ['internet', 'eth0'])] }
    engine = startLab(direct)
    run = engine.runUntilDone(engine.inject(pingRequest('pc', '8.8.8.8')))
    expect(run.events.find((event) => event.deviceId === 'internet')).toMatchObject({ action: 'dropped', reason: 'ispNoService' })
  })
})
