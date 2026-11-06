import { describe, expect, it } from 'vitest'
import type { NetworkState, PacketTrace } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { editHost } from './testLabs'
import { officeLab, unplug, vlanLab, wanDown } from './testNetworks'

const engine = new DefaultNetworkEngine()

function traceOf(state: NetworkState, deviceId: string, line: string): PacketTrace | undefined {
  return engine.runCommand(state, deviceId, line).trace
}

describe('ping trace — success', () => {
  it('follows the switch to a same-subnet host', () => {
    expect(traceOf(officeLab(), 'pc1', 'ping 192.168.1.150')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'printer'],
    })
  })

  it('goes through the router for inter-VLAN targets', () => {
    expect(traceOf(vlanLab(), 'kasa', 'ping 192.168.20.50')).toEqual({
      ok: true,
      path: ['kasa', 'switch', 'router', 'switch', 'guestPc'],
    })
  })

  it('ends at the internet device for public targets', () => {
    expect(traceOf(officeLab(), 'pc1', 'ping 8.8.8.8')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'router', 'internet'],
    })
  })

  it('traces to the resolved address when pinging a name', () => {
    expect(traceOf(officeLab(), 'pc1', 'ping google.com')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'router', 'internet'],
    })
  })
})

describe('ping trace — failure', () => {
  it('stays at the source when the gateway is outside the subnet', () => {
    const state = editHost(officeLab(), 'pc1', { defaultGateway: '10.0.0.1' })
    expect(traceOf(state, 'pc1', 'ping 8.8.8.8')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('stays at the source when a same-subnet target is missing', () => {
    expect(traceOf(officeLab(), 'pc1', 'ping 192.168.1.99')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('stops at the router when the target is missing in another VLAN', () => {
    expect(traceOf(vlanLab(), 'kasa', 'ping 192.168.20.99')).toEqual({
      ok: false,
      path: ['kasa', 'switch', 'router'],
    })
  })

  it('stops at the router when the WAN is down', () => {
    expect(traceOf(wanDown(officeLab()), 'pc1', 'ping 8.8.8.8')).toEqual({ ok: false, path: ['pc1', 'switch', 'router'] })
  })

  it('stays at the source when the cable is unplugged', () => {
    expect(traceOf(unplug(officeLab(), 'pc1Link'), 'pc1', 'ping 192.168.1.150')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('stays at the source when a name cannot be resolved', () => {
    expect(traceOf(officeLab(), 'pc1', 'ping yok.example')).toEqual({ ok: false, path: ['pc1'] })
  })

  it('sets no trace when no packet is sent', () => {
    expect(traceOf(officeLab(), 'pc1', 'ping')).toBeUndefined()
    expect(traceOf(officeLab(), 'pc1', 'ipconfig')).toBeUndefined()
  })
})

describe('reach stays unchanged', () => {
  it('still reports the drop device without a path', () => {
    expect(engine.reach(wanDown(officeLab()), 'pc1', '8.8.8.8')).toEqual({ ok: false, reason: 'wanDown', atDeviceId: 'router' })
  })
})
