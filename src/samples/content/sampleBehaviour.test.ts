// What the lesson texts promise the learner sees in the terminal (the workspace terminal runs on the
// simulator) and in the break-it ideas. Keeps samples:labs.* honest when the engine or simulator change.
import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { networkEngine } from '../../engine'
import { createSimulation, SimTerminal, type SimulationEngine } from '../../sim'
import { contentSamples } from './index'
import { MASK_24 } from './sampleKit'
import { accessVlan, addRoute, plug, power, removePool, removeRoutes, route, setGateway, setHelpers, setStatic, simRenew, trunk } from './testSolutions'

function lab(id: string): NetworkState {
  const sample = contentSamples.find((candidate) => candidate.id === id)
  if (!sample) throw new Error(`No sample ${id}`)
  return sample.lab().state
}

/** Output lines of one command typed into the terminal of a fresh simulator. */
function terminal(state: NetworkState, deviceId: string, commandLine: string): string[] {
  return SimTerminal.run(createSimulation(state), deviceId, commandLine).lines.map((line) => line.text ?? '')
}

/** First reply line of a one-echo ping on a running simulator. */
function pingOnce(engine: SimulationEngine, deviceId: string, ip: string): string {
  return SimTerminal.run(engine, deviceId, `ping -n 1 ${ip}`).lines.map((line) => line.text ?? '')[2] ?? ''
}

/** Applies a lab edit to a running simulator and lets the probes settle. */
function change(engine: SimulationEngine, state: NetworkState): NetworkState {
  engine.reconfigure(state)
  engine.runUntil(engine.time + 3000)
  return state
}

describe('basics samples behave as the lessons say', () => {
  it('basicsTwoPcs: PC2 waits for DHCP with an APIPA address; another subnet means "General failure"', () => {
    expect(terminal(lab('basicsTwoPcs'), 'pc2', 'ipconfig').join('\n')).toContain('Autoconfiguration IPv4 Address. . : 169.254.')
    const unplugged = plug(setStatic(lab('basicsTwoPcs'), 'pc2', '192.168.1.11'), 'pc2Link', false)
    expect(terminal(unplugged, 'pc1', 'ping 192.168.1.11')).toContain('Reply from 192.168.1.10: Destination host unreachable.')
    expect(terminal(setStatic(lab('basicsTwoPcs'), 'pc2', '192.168.2.11'), 'pc1', 'ping 192.168.2.11')).toContain('PING: transmit failed. General failure.')
  })

  it('basicsGateway: without PC2 gateway the reply is lost', () => {
    expect(terminal(lab('basicsGateway'), 'pc1', 'ping 192.168.2.10')).toContain('Request timed out.')
    const fixed = setGateway(lab('basicsGateway'), 'pc2', '192.168.2.1')
    expect(terminal(fixed, 'pc1', 'tracert 192.168.2.10').join('\n')).toMatch(/1 .*192\.168\.1\.1\n.*2 .*192\.168\.2\.10/)
  })

  it('basicsIpConflict: PC1 keeps its duplicate mark until it restarts', () => {
    expect(terminal(lab('basicsIpConflict'), 'pc1', 'ipconfig')).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.10(Duplicate)')
    const engine = createSimulation(lab('basicsIpConflict'))
    engine.runUntil(3000)
    let state = change(engine, setStatic(lab('basicsIpConflict'), 'pc3', '192.168.1.30'))
    expect(pingOnce(engine, 'pc3', '192.168.1.20')).toMatch(/^Reply from 192\.168\.1\.20/)
    expect(pingOnce(engine, 'pc1', '192.168.1.20')).toBe('PING: transmit failed. General failure.')
    state = change(engine, power(state, 'pc1', false))
    change(engine, power(state, 'pc1', true))
    expect(pingOnce(engine, 'pc1', '192.168.1.20')).toMatch(/^Reply from 192\.168\.1\.20/)
  })

  it('basicsIpConflict break-it: a powered-off PC cannot collide; the mask does not matter', () => {
    const engine = createSimulation(lab('basicsIpConflict'))
    engine.runUntil(3000)
    let state = change(engine, power(lab('basicsIpConflict'), 'pc1', false))
    state = change(engine, power(state, 'pc3', false))
    state = change(engine, power(state, 'pc3', true))
    expect(pingOnce(engine, 'pc3', '192.168.1.20')).toMatch(/^Reply from/)
    change(engine, power(state, 'pc1', true))
    expect(pingOnce(engine, 'pc3', '192.168.1.20')).toBe('PING: transmit failed. General failure.')
    const masked = setStatic(lab('basicsIpConflict'), 'pc3', '192.168.1.10', '255.255.0.0')
    expect(networkEngine.reach(masked, 'pc3', '192.168.1.20')).toMatchObject({ ok: false, reason: 'ipConflict' })
  })

  it('basicsApipa: the renew times out while DHCP1 is off', () => {
    expect(terminal(lab('basicsApipa'), 'pc1', 'ipconfig /renew').join('\n')).toContain('unable to contact your DHCP server')
  })
})

describe('DHCP samples behave as the lessons say', () => {
  it('dhcpRelay: the lease crosses R1 only through the helper address and needs the server gateway', () => {
    const renewed = simRenew(lab('dhcpRelay'), 'pc1')
    expect(terminal(renewed, 'pc1', 'ipconfig').join('\n')).toContain('192.168.10.100')
    expect(networkEngine.renewDhcp(lab('dhcpRelay'), 'pc1')).toMatchObject({ ok: false })
    expect(() => simRenew(removePool(lab('dhcpRelay'), 'dhcp1', 'CLIENTS'), 'pc1')).toThrow()
    expect(() => simRenew(setGateway(lab('dhcpRelay'), 'dhcp1', ''), 'pc1')).toThrow()
    // Break it: `no ip helper-address` on Gi0/0, then the DISCOVER broadcast stops at R1.
    expect(() => simRenew(setHelpers(renewed, 'r1', 'Gi0/0', []), 'pc1')).toThrow()
    expect(terminal(setHelpers(lab('dhcpRelay'), 'r1', 'Gi0/0', []), 'pc1', 'ipconfig /renew').join('\n')).toContain('unable to contact your DHCP server')
  })

  it('dhcpConflict: after the renew PC1 reaches R1, the printer answers only after its new address', () => {
    const engine = createSimulation(lab('dhcpConflict'))
    engine.runUntil(3000)
    expect(pingOnce(engine, 'pc1', '192.168.1.1')).toBe('PING: transmit failed. General failure.')
    const renewed = SimTerminal.run(engine, 'pc1', 'ipconfig /renew')
    expect(renewed.lines.map((line) => line.text ?? '').join('\n')).toContain('192.168.1.101')
    engine.runUntil(engine.time + 3000)
    expect(pingOnce(engine, 'pc1', '192.168.1.1')).toMatch(/^Reply from 192\.168\.1\.1:/)
    expect(pingOnce(engine, 'pc1', '192.168.1.100')).not.toMatch(/^Reply from 192\.168\.1\.100:/)
    if (!renewed.nextState) throw new Error('no lease')
    change(engine, setStatic(renewed.nextState, 'printer1', '192.168.1.10'))
    expect(pingOnce(engine, 'pc1', '192.168.1.10')).toMatch(/^Reply from 192\.168\.1\.10:/)
  })
})

describe('switching samples behave as the lessons say', () => {
  it('switchingNativeVlan: untagged frames leak from VLAN 99 into VLAN 1 on a mismatch', () => {
    expect(networkEngine.reach(lab('switchingNativeVlan'), 'pc2', '192.168.10.12')).toMatchObject({ ok: true })
    const leak = accessVlan(lab('switchingNativeVlan'), 'sw1', 'Fa0/1', 99)
    expect(networkEngine.reach(leak, 'pc1', '192.168.1.12')).toMatchObject({ ok: true })
    expect(terminal(leak, 'pc1', 'ping 192.168.1.12')[2]).toMatch(/^Reply from 192\.168\.1\.12/)
    expect(networkEngine.reach(trunk(lab('switchingNativeVlan'), 'sw1', 'Fa0/8', { nativeVlan: 1 }), 'pc1', '192.168.1.12')).toMatchObject({ ok: true })
  })

  it('switchingAllowedVlans: one end or a missing VLAN is not enough', () => {
    const oneEnd = trunk(lab('switchingAllowedVlans'), 'sw1', 'Fa0/8', { allowedVlans: [10, 20] })
    expect(networkEngine.reach(oneEnd, 'pc2', '192.168.20.12')).toMatchObject({ ok: false })
  })

  it('switchingOfficeWrongVlan: PC4 cannot find its gateway until its port is in VLAN 20, then the name resolves', () => {
    const broken = lab('switchingOfficeWrongVlan')
    expect(terminal(broken, 'pc4', 'ping 192.168.20.1')[2]).toBe('Reply from 192.168.20.12: Destination host unreachable.')
    expect(terminal(broken, 'pc4', 'ping sunucu.ofis')[0]).toBe('Ping request could not find host sunucu.ofis. Please check the name and try again.')
    expect(terminal(broken, 'pc3', 'ping 192.168.20.1')[2]).toMatch(/^Reply from 192\.168\.20\.1/)
    const fixed = accessVlan(broken, 'sw1', 'Fa0/5', 20)
    expect(terminal(fixed, 'pc4', 'ping 192.168.20.1')[2]).toMatch(/^Reply from 192\.168\.20\.1/)
    const byName = terminal(fixed, 'pc4', 'ping sunucu.ofis').join('\n')
    expect(byName).toContain('Pinging sunucu.ofis [192.168.10.10]')
    expect(byName).toMatch(/Reply from 192\.168\.10\.10/)
    // Break-it: a renew in the wrong VLAN takes an office address.
    expect(terminal(broken, 'pc4', 'ipconfig /renew').join('\n')).toContain('192.168.10.')
  })

  it('switchingSvi: the SVIs answer before ip routing, PC2 does not', () => {
    expect(terminal(lab('switchingSvi'), 'pc1', 'ping 192.168.10.1')[2]).toMatch(/^Reply from 192\.168\.10\.1/)
    expect(terminal(lab('switchingSvi'), 'pc1', 'ping 192.168.20.11')[2]).toBe('Request timed out.')
  })
})

describe('routing and packet view samples behave as the lessons say', () => {
  it('routingStaticDefault: R1 reports the missing route, and a one-way route times out', () => {
    expect(terminal(lab('routingStaticDefault'), 'pc1', 'ping 192.168.2.10')[2]).toBe('Reply from 192.168.1.1: Destination host unreachable.')
    const oneWay = addRoute(lab('routingStaticDefault'), 'r1', route('192.168.2.0', MASK_24, '10.0.0.2'))
    expect(terminal(oneWay, 'pc1', 'ping 192.168.2.10')[2]).toBe('Request timed out.')
  })

  it('routingFloatingStatic: the backup path goes through R3 and the primary wins when it is back', () => {
    const backup = addRoute(lab('routingFloatingStatic'), 'r1', route('192.168.2.0', MASK_24, '10.0.13.2', 5))
    expect(terminal(backup, 'pc1', 'tracert 192.168.2.10').join('\n')).toContain('10.0.13.2')
    expect(terminal(plug(backup, 'primary'), 'pc1', 'tracert 192.168.2.10').join('\n')).toContain('10.0.12.2')
    expect(terminal(removeRoutes(backup, 'r2', '192.168.1.0'), 'pc1', 'ping 192.168.2.10')[2]).toBe('Request timed out.')
  })

  it('routingLoop: TTL expires between R1 and R2; without the route R2 says unreachable', () => {
    expect(terminal(lab('routingLoop'), 'pc1', 'ping 192.168.3.10')[2]).toBe('Reply from 10.0.12.2: TTL expired in transit.')
    expect(terminal(removeRoutes(lab('routingLoop'), 'r2', '192.168.3.0'), 'pc1', 'ping 192.168.3.10')[2]).toBe('Reply from 10.0.12.2: Destination host unreachable.')
  })

  it('packetTtlTracert: the trace stops after R2, and the reply TTL is 125 once R3 can answer', () => {
    const stopped = terminal(lab('packetTtlTracert'), 'pc1', 'tracert 192.168.3.10')
    expect(stopped[4]).toContain('10.0.12.2')
    expect(stopped[5]).toContain('Request timed out.')
    const fixed = addRoute(lab('packetTtlTracert'), 'r3', route('0.0.0.0', '0.0.0.0', '10.0.23.1'))
    expect(terminal(fixed, 'pc1', 'ping 192.168.3.10')[2]).toContain('TTL=125')
  })

  it('packetArp: arp -a lists PC2 after the first ping', () => {
    const engine = createSimulation(lab('packetArp'))
    SimTerminal.run(engine, 'pc1', 'ping -n 1 192.168.1.20')
    expect(SimTerminal.run(engine, 'pc1', 'arp -a').lines.map((line) => line.text ?? '').join('\n')).toMatch(/192\.168\.1\.20\s+[0-9a-f-]+\s+dynamic/)
  })
})
