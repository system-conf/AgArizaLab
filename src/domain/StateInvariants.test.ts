import { describe, expect, it } from 'vitest'
import type { Device } from './DeviceTypes'
import type { NetworkState } from './NetworkState'
import { StateInvariants } from './StateInvariants'
import { cableLab, makeDevice, routedPort, updatePort, withLinks } from './testDevices'

const invariants = new StateInvariants()

function withDevice(state: NetworkState, device: Device): NetworkState {
  return { ...state, devices: [...state.devices, device] }
}

describe('StateInvariants', () => {
  it('accepts a consistent lab', () => {
    const state = withLinks(cableLab(), [
      { id: 'uplink', a: { deviceId: 'router', portId: 'Gi0/0' }, b: { deviceId: 'sw', portId: 'Fa0/1' }, connected: true, cable: 'copperStraight' },
    ])
    expect(invariants.violations(state)).toEqual([])
  })

  it('reports duplicate device, link and port ids', () => {
    const base = cableLab()
    const link = { id: 'x', a: { deviceId: 'pc', portId: 'eth0' }, b: { deviceId: 'sw', portId: 'Fa0/1' }, connected: true, cable: 'copperStraight' as const }
    const twin = makeDevice('twin', 'router', [routedPort('Gi0/0'), routedPort('Gi0/0')])
    const state = withLinks(withDevice(withDevice(base, twin), makeDevice('pc', 'pc', [])), [link, { ...link, a: { deviceId: 'sw2', portId: 'Fa0/1' }, cable: 'copperCross' }])
    const codes = invariants.violations(state).map((violation) => violation.code)
    expect(codes).toContain('duplicateDeviceId')
    expect(codes).toContain('duplicateLinkId')
    expect(codes).toContain('duplicatePortId')
  })

  it('reports malformed and clashing sub-interface ids and VLANs out of range', () => {
    const state = updatePort(cableLab(), 'router', 'Gi0/0', (port) =>
      port.role === 'routed'
        ? {
            ...port,
            subInterfaces: [
              { id: 'Gi0/1.10', vlan: 10, adminUp: true, l3: port.l3 },
              { id: 'Gi0/0.20', vlan: 5000, adminUp: true, l3: port.l3 },
              { id: 'Gi0/0.20', vlan: 20, adminUp: true, l3: port.l3 },
            ],
          }
        : port,
    )
    expect(invariants.violations(state)).toEqual([
      { code: 'badInterfaceId', deviceId: 'router', portId: 'Gi0/1.10' },
      { code: 'vlanOutOfRange', deviceId: 'router', portId: 'Gi0/0.20' },
      { code: 'badInterfaceId', deviceId: 'router', portId: 'Gi0/0.20' },
    ])
  })

  it('reports invalid and duplicate MACs', () => {
    const copied = cableLab()
    const pcMac = copied.devices[0]?.ports[0]?.mac ?? ''
    const state = updatePort(updatePort(copied, 'sw', 'Fa0/1', (port) => ({ ...port, mac: pcMac })), 'sw', 'Fa0/2', (port) => ({
      ...port,
      mac: 'zz',
    }))
    expect(invariants.violations(state)).toEqual([
      { code: 'duplicateMac', deviceId: 'sw', portId: 'Fa0/1' },
      { code: 'invalidMac', deviceId: 'sw', portId: 'Fa0/2' },
    ])
  })

  it('reports a VLAN database without VLAN 1', () => {
    const state: NetworkState = {
      devices: [{ ...makeDevice('sw', 'switch', []), switching: { vlans: [{ id: 10, name: 'VLAN0010' }], svis: [], defaultGateway: '' } }],
      links: [],
    }
    expect(invariants.violations(state)).toEqual([{ code: 'missingDefaultVlan', deviceId: 'sw' }])
  })

  it('reports links that CableRules refuses', () => {
    const state = withLinks(cableLab(), [
      { id: 'bad', a: { deviceId: 'pc', portId: 'eth0' }, b: { deviceId: 'sw', portId: 'Gi0/1' }, connected: true, cable: 'copperStraight' },
    ])
    expect(invariants.violations(state)).toEqual([{ code: 'invalidLink', linkId: 'bad', reason: 'cableDoesNotFitPort' }])
  })
})
