import { describe, expect, it } from 'vitest'
import type { PacketTrace } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { officeNetwork, updateDevice, updateHost, updateLink, vlanNetwork } from './testFixtures'

const engine = new DefaultNetworkEngine()

function traceOf(state: NetworkState, deviceId: string, line: string): PacketTrace | undefined {
  return engine.runCommand(state, deviceId, line).trace
}

describe('ping trace — success', () => {
  it('follows the switch to a same-subnet host', () => {
    expect(traceOf(officeNetwork(), 'pc1', 'ping 192.168.1.150')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'printer'],
    })
  })

  it('goes through the router for inter-VLAN targets', () => {
    expect(traceOf(vlanNetwork(), 'kasa', 'ping 192.168.20.50')).toEqual({
      ok: true,
      path: ['kasa', 'switch', 'router', 'switch', 'guestPc'],
    })
  })

  it('ends at the internet device for public targets', () => {
    expect(traceOf(officeNetwork(), 'pc1', 'ping 8.8.8.8')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'router', 'internet'],
    })
  })

  it('traces to the resolved address when pinging a name', () => {
    expect(traceOf(officeNetwork(), 'pc1', 'ping google.com')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'router', 'internet'],
    })
  })
})

describe('ping trace — failure', () => {
  it('stays at the source when the gateway is outside the subnet', () => {
    const state = updateHost(officeNetwork(), 'pc1', { gateway: '10.0.0.1' })
    expect(traceOf(state, 'pc1', 'ping 8.8.8.8')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('stays at the source when a same-subnet target is missing', () => {
    expect(traceOf(officeNetwork(), 'pc1', 'ping 192.168.1.99')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('stops at the router when the target is missing in another VLAN', () => {
    expect(traceOf(vlanNetwork(), 'kasa', 'ping 192.168.20.99')).toEqual({
      ok: false,
      path: ['kasa', 'switch', 'router'],
    })
  })

  it('stops at the router when the WAN is down', () => {
    const state = updateDevice(officeNetwork(), 'router', (device) => ({ ...device, wanUp: false }))
    expect(traceOf(state, 'pc1', 'ping 8.8.8.8')).toEqual({ ok: false, path: ['pc1', 'switch', 'router'] })
  })

  it('stays at the source when the cable is unplugged', () => {
    const state = updateLink(officeNetwork(), 'pc1Link', { connected: false })
    expect(traceOf(state, 'pc1', 'ping 192.168.1.150')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('stays at the source when a name cannot be resolved', () => {
    expect(traceOf(officeNetwork(), 'pc1', 'ping yok.example')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('sets no trace when no packet is sent', () => {
    expect(traceOf(officeNetwork(), 'pc1', 'ping')).toBeUndefined()
    expect(traceOf(officeNetwork(), 'pc1', 'ipconfig')).toBeUndefined()
  })
})

describe('reach stays unchanged', () => {
  it('still reports the drop device without a path', () => {
    const state = updateDevice(officeNetwork(), 'router', (device) => ({ ...device, wanUp: false }))
    expect(engine.reach(state, 'pc1', '8.8.8.8')).toEqual({ ok: false, reason: 'wanDown', atDeviceId: 'router' })
  })
})
