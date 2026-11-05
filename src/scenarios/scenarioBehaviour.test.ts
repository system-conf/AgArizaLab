import { describe, expect, it } from 'vitest'
import type { Device, HostNetworkConfig, NetworkState } from '../domain/NetworkTypes'
import type { Scenario } from '../domain/ScenarioTypes'
import { networkEngine, solveChecker } from '../engine'
import { cameraSubnet } from './cameraSubnet'
import { kitchenVlan } from './kitchenVlan'
import { posGateway } from './posGateway'
import { printerDhcp } from './printerDhcp'
import { wrongDns } from './wrongDns'

const endDeviceKinds = new Set(['pc', 'pos', 'printer', 'camera', 'nvr', 'kitchenDisplay', 'phone'])

function mapDevice(state: NetworkState, deviceId: string, change: (device: Device) => Device): NetworkState {
  expect(state.devices.some((device) => device.id === deviceId), deviceId).toBe(true)
  return {
    ...state,
    devices: state.devices.map((device) => (device.id === deviceId ? change(device) : device)),
  }
}

function withHost(state: NetworkState, deviceId: string, host: Partial<HostNetworkConfig>): NetworkState {
  return mapDevice(state, deviceId, (device) => {
    if (!device.host) throw new Error(`${deviceId} has no host config`)
    return { ...device, host: { ...device.host, ...host } }
  })
}

function withAppLinkTarget(state: NetworkState, deviceId: string, appLinkId: string, targetIp: string): NetworkState {
  return mapDevice(state, deviceId, (device) => ({
    ...device,
    appLinks: (device.appLinks ?? []).map((appLink) => (appLink.id === appLinkId ? { ...appLink, targetIp } : appLink)),
  }))
}

function withSwitchPortVlan(state: NetworkState, switchId: string, portId: string, vlan: number): NetworkState {
  return mapDevice(state, switchId, (device) => ({
    ...device,
    switchPorts: (device.switchPorts ?? []).map((port) =>
      port.id === portId ? { ...port, mode: 'access' as const, vlan } : port,
    ),
  }))
}

function isSolved(scenario: Scenario, state: NetworkState): boolean {
  return solveChecker.check(state, scenario.solvedWhen).every((result) => result.ok)
}

function failingConditions(scenario: Scenario, state: NetworkState) {
  return solveChecker.check(state, scenario.solvedWhen).filter((result) => !result.ok)
}

function endDeviceIds(state: NetworkState): string[] {
  return state.devices.filter((device) => endDeviceKinds.has(device.kind)).map((device) => device.id)
}

/** After the fix every end device must reach the internet (none of the 5 scenarios has an offline-by-design device). */
function expectAllEndDevicesOnline(state: NetworkState) {
  for (const deviceId of endDeviceIds(state)) {
    expect(networkEngine.reach(state, deviceId, '8.8.8.8'), deviceId).toMatchObject({ ok: true })
  }
}

interface BehaviourCase {
  scenario: Scenario
  expectBrokenSymptom: (state: NetworkState) => void
  applyFix: (state: NetworkState) => NetworkState
}

const cases: BehaviourCase[] = [
  {
    scenario: posGateway,
    expectBrokenSymptom: (state) => {
      expect(networkEngine.reach(state, 'kasa', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayOutsideSubnet' })
    },
    applyFix: (state) => withHost(state, 'kasa', { gateway: '192.168.10.1' }),
  },
  {
    scenario: printerDhcp,
    expectBrokenSymptom: (state) => {
      for (const pcId of ['muhasebe', 'satis']) {
        const statuses = networkEngine.appLinkStatus(state, pcId)
        expect(statuses.every((status) => status.ok), pcId).toBe(false)
      }
    },
    applyFix: (state) =>
      withHost(state, 'yazici', {
        mode: 'static',
        ip: '192.168.1.150',
        mask: '255.255.255.0',
        gateway: '192.168.1.1',
        dns: ['192.168.1.1'],
      }),
  },
  {
    scenario: cameraSubnet,
    expectBrokenSymptom: (state) => {
      const statuses = networkEngine.appLinkStatus(state, 'nvr')
      expect(statuses.find((status) => status.appLinkId === 'kamera3')?.ok).toBe(false)
      expect(statuses.filter((status) => status.appLinkId !== 'kamera3').every((status) => status.ok)).toBe(true)
    },
    applyFix: (state) => withHost(state, 'kamera3', { ip: '192.168.1.63', gateway: '192.168.1.1', dns: ['192.168.1.1'] }),
  },
  {
    scenario: kitchenVlan,
    expectBrokenSymptom: (state) => {
      expect(networkEngine.appLinkStatus(state, 'kasa').every((status) => status.ok)).toBe(false)
    },
    applyFix: (state) => withSwitchPortVlan(state, 'switch', 'Fa0/3', 10),
  },
  {
    scenario: wrongDns,
    expectBrokenSymptom: (state) => {
      expect(networkEngine.reach(state, 'muhasebe', '8.8.8.8').ok).toBe(true)
      expect(networkEngine.resolve(state, 'muhasebe', 'google.com').ok).toBe(false)
    },
    applyFix: (state) => withHost(state, 'muhasebe', { dns: ['192.168.1.1'] }),
  },
]

describe.each(cases.map((testCase): [string, BehaviourCase] => [testCase.scenario.id, testCase]))(
  'scenario %s behaviour',
  (_id, { scenario, expectBrokenSymptom, applyFix }) => {
    const initial = scenario.initialState

    it('is not solved at the start', () => {
      expect(isSolved(scenario, initial)).toBe(false)
    })

    it('shows the broken symptom at the start', () => {
      expectBrokenSymptom(initial)
    })

    it('is solved by the fix described in hint 3', () => {
      const fixed = applyFix(initial)
      expect(failingConditions(scenario, fixed)).toEqual([])
    })

    it('leaves every end device online after the fix', () => {
      expectAllEndDevicesOnline(applyFix(initial))
    })
  },
)

describe('scenario printerDhcp alternative fix', () => {
  it('is solved by pointing both PCs at the printer address 192.168.1.153', () => {
    const withMuhasebe = withAppLinkTarget(printerDhcp.initialState, 'muhasebe', 'yazici', '192.168.1.153')
    const fixed = withAppLinkTarget(withMuhasebe, 'satis', 'yazici', '192.168.1.153')
    expect(failingConditions(printerDhcp, fixed)).toEqual([])
    expectAllEndDevicesOnline(fixed)
  })

  it('is not solved when only one PC is changed', () => {
    const partly = withAppLinkTarget(printerDhcp.initialState, 'muhasebe', 'yazici', '192.168.1.153')
    expect(isSolved(printerDhcp, partly)).toBe(false)
  })
})
