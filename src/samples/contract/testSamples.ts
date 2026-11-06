// Test-only sample definitions for the contract tests (the flat office lab of the engine tests).
import type { LabLayout, NetworkState } from '../../domain'
import { officeLab } from '../../engine/testNetworks'
import type { SampleDefinition } from './SampleTypes'

/** Every device in a row, 120 canvas units apart. */
export function rowLayout(state: NetworkState): LabLayout {
  return { devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: index * 120, y: 0 }])) }
}

/** Removes a device and its links (what deleting it in the workspace does). */
export function withoutDevice(state: NetworkState, deviceId: string): NetworkState {
  return {
    devices: state.devices.filter((device) => device.id !== deviceId),
    links: state.links.filter((link) => link.a.deviceId !== deviceId && link.b.deviceId !== deviceId),
  }
}

/** A valid sample on officeLab: one step of every check kind plus a manual simulation step. */
export function officeSample(overrides: Partial<SampleDefinition> = {}): SampleDefinition {
  return {
    id: 'officeBasics',
    category: 'basics',
    order: 1,
    level: 'beginner',
    features: [],
    lab: () => {
      const state = officeLab()
      return { state, layout: rowLayout(state) }
    },
    groups: [{ id: 'pcs', name: 'pcs', deviceIds: ['pc1', 'pc2'] }],
    steps: [
      { id: 'pingPrinter', focusDeviceId: 'pc1', checks: [{ type: 'solve', condition: { type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' } }] },
      { id: 'watchArp', mode: 'simulation' },
      { id: 'pcsOnline', checks: [{ type: 'network', condition: { type: 'internet', group: 'pcs' } }] },
      {
        id: 'printerInPlan',
        checks: [
          { type: 'network', condition: { type: 'addressPlan', group: 'printer', prefix: '192.168.1.0/24' } },
          { type: 'hasAddress', deviceId: 'pc1', prefix: '192.168.1.0/24' },
        ],
      },
    ],
    breakIt: ['unplugPrinter', 'wrongGateway'],
    related: [{ kind: 'exercise', exerciseId: 'posGateway' }],
    ...overrides,
  }
}
