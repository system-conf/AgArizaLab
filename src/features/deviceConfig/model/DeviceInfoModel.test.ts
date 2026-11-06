import { describe, expect, it } from 'vitest'
import type { DeviceV2, NetworkStateV2, Port } from '../../../domain/v2'
import { cableLab, updatePortV2, withLinks } from '../../../domain/v2/testDevicesV2'
import { ConfigLocks } from './ConfigLocks'
import { DeviceInfoModel } from './DeviceInfoModel'

function device(state: NetworkStateV2, id: string): DeviceV2 {
  const found = state.devices.find((candidate) => candidate.id === id)
  if (!found) throw new Error(id)
  return found
}

function addressed(address: string, mask: string) {
  return (port: Port): Port => (port.role === 'routed' || port.role === 'host' ? { ...port, l3: { ipv4: { addressing: 'static', address, mask } } } : port)
}

function lab(): NetworkStateV2 {
  let state = withLinks(cableLab(), [
    { id: 'l1', cable: 'copperStraight', a: { deviceId: 'router', portId: 'Gi0/0' }, b: { deviceId: 'sw', portId: 'Fa0/1' }, connected: true },
    { id: 'l2', cable: 'copperStraight', a: { deviceId: 'pc', portId: 'eth0' }, b: { deviceId: 'sw', portId: 'Fa0/2' }, connected: false },
  ])
  state = updatePortV2(state, 'router', 'Gi0/0', addressed('192.168.1.1', '255.255.255.0'))
  state = updatePortV2(state, 'router', 'Se0/0/0', addressed('10.0.0.1', '255.255.255.252'))
  return {
    ...state,
    devices: state.devices.map((candidate) =>
      candidate.id === 'router'
        ? { ...candidate, routing: { ipRouting: true, staticRoutes: [{ prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, nextHop: '192.168.1.254' }] } }
        : candidate,
    ),
  }
}

describe('DeviceInfoModel', () => {
  it('reports link lights and neighbours per port', () => {
    const state = lab()
    const sw = device(state, 'sw')
    expect(DeviceInfoModel.portStatus(state, sw, 'Fa0/1')).toEqual({
      light: 'up',
      neighbours: [{ deviceId: 'router', deviceName: 'router', portId: 'Gi0/0' }],
    })
    expect(DeviceInfoModel.portStatus(state, sw, 'Fa0/2').light).toBe('unplugged')
    expect(DeviceInfoModel.portStatus(state, sw, 'Gi0/1')).toEqual({ light: 'noCable', neighbours: [] })
    const shut = updatePortV2(state, 'router', 'Gi0/0', (port) => ({ ...port, adminUp: false }))
    expect(DeviceInfoModel.portStatus(shut, device(shut, 'sw'), 'Fa0/1').light).toBe('down')
  })

  it('summarises port settings and hides locked ones', () => {
    const state = lab()
    const router = device(state, 'router')
    const locks = new ConfigLocks('router', [{ scope: 'port', deviceId: 'router', portId: 'Se0/0/0', access: 'hidden' }])
    const [gi, serial] = DeviceInfoModel.ports(state, router, locks)
    expect(gi).toMatchObject({
      id: 'Gi0/0',
      light: 'up',
      adminUp: true,
      settings: { kind: 'l3', ipv4: { address: '192.168.1.1' }, subInterfaces: [] },
    })
    expect(serial).toMatchObject({ id: 'Se0/0/0', access: 'hidden', adminUp: null, settings: null, light: 'noCable' })
    const sw = device(state, 'sw')
    const trunk = { ...sw.ports[0], role: 'switched', l2: { mode: 'trunk', accessVlan: 1, nativeVlan: 99, allowedVlans: [1, 10, 11] } } as Port
    expect(DeviceInfoModel.settingsOf(trunk)).toEqual({ kind: 'trunk', nativeVlan: 99, allowed: '1,10-11' })
  })

  it('lists connected networks of up interfaces and every static route', () => {
    const state = lab()
    expect(DeviceInfoModel.routes(state, device(state, 'router'))).toEqual([
      { type: 'connected', network: '192.168.1.0', prefixLength: 24, interfaceId: 'Gi0/0', adminDistance: 0 },
      { type: 'static', network: '0.0.0.0', prefixLength: 0, nextHop: '192.168.1.254', adminDistance: 1 },
    ])
  })
})
