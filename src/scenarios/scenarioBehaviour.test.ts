// The five exercises on the engine: every exercise migrated with migrateV1ToV2, its broken symptom,
// and the hint-3 fixes applied as edits (NIC address, host settings, switchport, AppLink).
import { describe, expect, it } from 'vitest'
import { isEndDeviceKind, type NetworkState, type SolveCondition } from '../domain'
import { migrateV1ToV2 } from '../lab/migrations'
import { cameraSubnet } from './cameraSubnet'
import { kitchenVlan } from './kitchenVlan'
import { posGateway } from './posGateway'
import { printerDhcp } from './printerDhcp'
import { wrongDns } from './wrongDns'
import { networkEngine as engine, solveChecker } from '../engine'
import { editAddress, editDevice, editHost, editSwitchport } from '../engine/testLabs'

interface BehaviourCase {
  id: string
  initial: NetworkState
  solvedWhen: SolveCondition[]
  expectBrokenSymptom: (state: NetworkState) => void
  applyFix: (state: NetworkState) => NetworkState
}

function withAppLinkTarget(state: NetworkState, deviceId: string, appLinkId: string, targetIp: string): NetworkState {
  return editDevice(state, deviceId, (device) => ({
    ...device,
    ...(device.host
      ? { host: { ...device.host, appLinks: device.host.appLinks.map((link) => (link.id === appLinkId ? { ...link, targetIp } : link)) } }
      : {}),
  }))
}

function failing(state: NetworkState, conditions: SolveCondition[]) {
  return solveChecker.check(state, conditions).filter((result) => !result.ok)
}

function expectAllEndDevicesOnline(state: NetworkState) {
  for (const device of state.devices.filter((candidate) => isEndDeviceKind(candidate.kind))) {
    expect(engine.reach(state, device.id, '8.8.8.8'), device.id).toMatchObject({ ok: true })
  }
}

const cases: BehaviourCase[] = [
  {
    id: posGateway.id,
    initial: migrateV1ToV2(posGateway.initialState),
    solvedWhen: posGateway.solvedWhen,
    expectBrokenSymptom: (state) => {
      expect(engine.reach(state, 'kasa', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayOutsideSubnet' })
    },
    applyFix: (state) => editHost(state, 'kasa', { defaultGateway: '192.168.10.1' }),
  },
  {
    id: printerDhcp.id,
    initial: migrateV1ToV2(printerDhcp.initialState),
    solvedWhen: printerDhcp.solvedWhen,
    expectBrokenSymptom: (state) => {
      for (const pcId of ['muhasebe', 'satis']) {
        expect(engine.appLinkStatus(state, pcId).every((status) => status.ok), pcId).toBe(false)
      }
    },
    applyFix: (state) =>
      editHost(editAddress(state, 'yazici', 'eth0', { addressing: 'static', address: '192.168.1.150', mask: '255.255.255.0' }), 'yazici', {
        defaultGateway: '192.168.1.1',
        dnsServers: ['192.168.1.1'],
      }),
  },
  {
    id: cameraSubnet.id,
    initial: migrateV1ToV2(cameraSubnet.initialState),
    solvedWhen: cameraSubnet.solvedWhen,
    expectBrokenSymptom: (state) => {
      const statuses = engine.appLinkStatus(state, 'nvr')
      expect(statuses.find((status) => status.appLinkId === 'kamera3')?.ok).toBe(false)
      expect(statuses.filter((status) => status.appLinkId !== 'kamera3').every((status) => status.ok)).toBe(true)
    },
    applyFix: (state) =>
      editHost(editAddress(state, 'kamera3', 'eth0', { address: '192.168.1.63' }), 'kamera3', {
        defaultGateway: '192.168.1.1',
        dnsServers: ['192.168.1.1'],
      }),
  },
  {
    id: kitchenVlan.id,
    initial: migrateV1ToV2(kitchenVlan.initialState),
    solvedWhen: kitchenVlan.solvedWhen,
    expectBrokenSymptom: (state) => {
      expect(engine.appLinkStatus(state, 'kasa').every((status) => status.ok)).toBe(false)
    },
    applyFix: (state) => editSwitchport(state, 'switch', 'Fa0/3', { mode: 'access', accessVlan: 10 }),
  },
  {
    id: wrongDns.id,
    initial: migrateV1ToV2(wrongDns.initialState),
    solvedWhen: wrongDns.solvedWhen,
    expectBrokenSymptom: (state) => {
      expect(engine.reach(state, 'muhasebe', '8.8.8.8').ok).toBe(true)
      expect(engine.resolve(state, 'muhasebe', 'google.com').ok).toBe(false)
    },
    applyFix: (state) => editHost(state, 'muhasebe', { dnsServers: ['192.168.1.1'] }),
  },
]

describe.each(cases.map((testCase): [string, BehaviourCase] => [testCase.id, testCase]))(
  'exercise %s on the engine',
  (_id, { initial, solvedWhen, expectBrokenSymptom, applyFix }) => {
    it('is not solved at the start', () => {
      expect(failing(initial, solvedWhen)).not.toEqual([])
    })

    it('shows the broken symptom at the start', () => {
      expectBrokenSymptom(initial)
    })

    it('is solved by the fix described in hint 3', () => {
      expect(failing(applyFix(initial), solvedWhen)).toEqual([])
    })

    it('leaves every end device online after the fix', () => {
      expectAllEndDevicesOnline(applyFix(initial))
    })
  },
)

describe('exercise printerDhcp alternative fix', () => {
  const initial = migrateV1ToV2(printerDhcp.initialState)

  it('is solved by pointing both PCs at the printer address 192.168.1.153', () => {
    const fixed = withAppLinkTarget(withAppLinkTarget(initial, 'muhasebe', 'yazici', '192.168.1.153'), 'satis', 'yazici', '192.168.1.153')
    expect(failing(fixed, printerDhcp.solvedWhen)).toEqual([])
    expectAllEndDevicesOnline(fixed)
  })

  it('is not solved when only one PC is changed', () => {
    const partly = withAppLinkTarget(initial, 'muhasebe', 'yazici', '192.168.1.153')
    expect(failing(partly, printerDhcp.solvedWhen)).not.toEqual([])
  })
})
