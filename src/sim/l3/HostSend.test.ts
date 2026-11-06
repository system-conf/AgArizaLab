import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { editAddress, editDevice, editHost, editLink, editPort } from '../../engine/testLabs'
import type { EchoResult } from '../contract'
import { type L3TestOptions, l3Engine } from './l3TestLayers'
import { ping, twoRouterLab } from './l3TestLabs'

function firstEcho(state: NetworkState, targetIp: string, options: L3TestOptions = {}, deviceId = 'pc1'): { echo: EchoResult | undefined; reasons: string[] } {
  const { engine } = l3Engine(state, options)
  const id = engine.inject(ping(deviceId, targetIp))
  engine.runUntilDone(id)
  const result = engine.request(id)?.result
  const reasons = engine.events().flatMap((event) => (event.deviceId === deviceId && event.action === 'dropped' && event.reason ? [event.reason] : []))
  return { echo: result?.kind === 'ping' ? result.echoes[0] : undefined, reasons }
}

describe('network layer: host send checks (rule engine order)', () => {
  const lab = twoRouterLab()

  it.each([
    ['cableDisconnected', editLink(lab, 'l1', (link) => ({ ...link, connected: false }))],
    ['portDisabled', editPort(lab, 'pc1', 'eth0', (port) => ({ ...port, adminUp: false }))],
    ['noIpAddress', editAddress(lab, 'pc1', 'eth0', { address: '', mask: '' })],
    ['invalidConfig', editAddress(lab, 'pc1', 'eth0', { address: '10.0.1.300' })],
    ['invalidHostAddress', editAddress(lab, 'pc1', 'eth0', { address: '10.0.1.0' })],
    ['gatewayNotSet', editHost(lab, 'pc1', { defaultGateway: '' })],
    ['invalidConfig', editHost(lab, 'pc1', { defaultGateway: '10.0.1' })],
  ] as const)('%s: a local failure, nothing is sent', (reason, state) => {
    const { echo, reasons } = firstEcho(state, '10.0.2.10')
    expect(echo).toEqual({ kind: 'localFailure', sequence: 1, reason })
    expect(reasons).toEqual([reason])
  })

  it('ipConflict: the link layer says the address is a duplicate', () => {
    expect(firstEcho(lab, '10.0.2.10', { conflicts: ['pc1/eth0'] }).echo).toEqual({ kind: 'localFailure', sequence: 1, reason: 'ipConflict' })
  })

  it('an invalid destination is a configuration error', () => {
    expect(firstEcho(lab, '10.0.2').echo).toEqual({ kind: 'localFailure', sequence: 1, reason: 'invalidConfig' })
  })

  it('checks the own address before the gateway', () => {
    const state = editHost(editAddress(lab, 'pc1', 'eth0', { address: '' }), 'pc1', { defaultGateway: '' })
    expect(firstEcho(state, '10.0.2.10').echo).toMatchObject({ kind: 'localFailure', reason: 'noIpAddress' })
  })

  it('a gateway outside the own subnet is reported as unreachable from the own address (Windows)', () => {
    const { echo, reasons } = firstEcho(editHost(lab, 'pc1', { defaultGateway: '10.0.9.1' }), '10.0.2.10')
    expect(echo).toMatchObject({ kind: 'unreachable', fromIp: '10.0.1.10', code: 'host' })
    expect(reasons).toEqual(['gatewayOutsideSubnet'])
  })

  it('a destination in the own subnet needs no gateway', () => {
    expect(firstEcho(editHost(lab, 'pc1', { defaultGateway: '' }), '10.0.1.1').echo).toMatchObject({ kind: 'reply', fromIp: '10.0.1.1' })
  })

  it('a layer-2 switch sends from its management SVI', () => {
    const state = editDevice(lab, 'sw1', (device) => ({
      ...device,
      switching: {
        vlans: device.switching?.vlans ?? [],
        svis: [{ vlan: 1, adminUp: true, l3: { ipv4: { addressing: 'static', address: '10.0.1.2', mask: '255.255.255.0' } } }],
        defaultGateway: '10.0.1.1',
      },
    }))
    expect(firstEcho(state, '10.0.1.10', {}, 'sw1').echo).toMatchObject({ kind: 'reply', fromIp: '10.0.1.10', ttl: 128 })
    expect(firstEcho(state, '10.0.2.10', {}, 'sw1').echo).toMatchObject({ kind: 'reply', fromIp: '10.0.2.10', ttl: 126 })
  })

  it('a gateway that does not route drops the packet: timeout (accepted divergence 1)', () => {
    const state = editHost(lab, 'pc1', { defaultGateway: '10.0.1.2' })
    const withSvi = editDevice(state, 'sw1', (device) => ({
      ...device,
      switching: {
        vlans: device.switching?.vlans ?? [],
        svis: [{ vlan: 1, adminUp: true, l3: { ipv4: { addressing: 'static', address: '10.0.1.2', mask: '255.255.255.0' } } }],
        defaultGateway: '',
      },
    }))
    const { engine } = l3Engine(withSvi)
    const id = engine.inject(ping('pc1', '10.0.2.10'))
    engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ echoes: [{ kind: 'timeout' }] })
    expect(engine.events().find((event) => event.deviceId === 'sw1' && event.layer === 3)).toMatchObject({ action: 'dropped', reason: 'notRouting' })
  })
})
