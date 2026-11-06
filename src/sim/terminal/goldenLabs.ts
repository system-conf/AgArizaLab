// Test-only: the labs the simulator's terminal and verify checker are compared on with the rule engine
// (docs/SIMULATION.md §10.1): the engine's test networks and the five exercises, broken and fixed (the
// hint-3 fixes of src/scenarios/scenarioBehaviour.test.ts).
import type { NetworkState, SolveCondition } from '../../domain'
import { editAddress, editHost, editSwitchport } from '../../engine/testLabs'
import { editNic, editRouterServices, officeLab, officePool, powerOff, shutPort, unplug, vlanLab, wanDown } from '../../engine/testNetworks'
import { migrateV1ToV2 } from '../../lab/migrations'
import { cameraSubnet } from '../../scenarios/cameraSubnet'
import { kitchenVlan } from '../../scenarios/kitchenVlan'
import { posGateway } from '../../scenarios/posGateway'
import { printerDhcp } from '../../scenarios/printerDhcp'
import { wrongDns } from '../../scenarios/wrongDns'

export interface GoldenExercise {
  readonly id: string
  readonly initial: NetworkState
  readonly fixed: NetworkState
  readonly solvedWhen: readonly SolveCondition[]
}

function exercise(id: string, v1: Parameters<typeof migrateV1ToV2>[0], solvedWhen: readonly SolveCondition[], fix: (state: NetworkState) => NetworkState): GoldenExercise {
  const initial = migrateV1ToV2(v1)
  return { id, initial, fixed: fix(initial), solvedWhen }
}

export const goldenExercises: readonly GoldenExercise[] = [
  exercise(posGateway.id, posGateway.initialState, posGateway.solvedWhen, (state) => editHost(state, 'kasa', { defaultGateway: '192.168.10.1' })),
  exercise(printerDhcp.id, printerDhcp.initialState, printerDhcp.solvedWhen, (state) =>
    editHost(editAddress(state, 'yazici', 'eth0', { addressing: 'static', address: '192.168.1.150', mask: '255.255.255.0' }), 'yazici', {
      defaultGateway: '192.168.1.1',
      dnsServers: ['192.168.1.1'],
    }),
  ),
  exercise(cameraSubnet.id, cameraSubnet.initialState, cameraSubnet.solvedWhen, (state) =>
    editHost(editAddress(state, 'kamera3', 'eth0', { address: '192.168.1.63' }), 'kamera3', { defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1'] }),
  ),
  exercise(kitchenVlan.id, kitchenVlan.initialState, kitchenVlan.solvedWhen, (state) => editSwitchport(state, 'switch', 'Fa0/3', { mode: 'access', accessVlan: 10 })),
  exercise(wrongDns.id, wrongDns.initialState, wrongDns.solvedWhen, (state) => editHost(state, 'muhasebe', { dnsServers: ['192.168.1.1'] })),
]

/** pc2 has no lease and the only pool address is pc1's: no DHCP answer. */
function exhaustedPool(): NetworkState {
  const pool = { ...officePool('pool1', '192.168.1'), range: { start: '192.168.1.20', end: '192.168.1.20' } }
  return editNic(
    editRouterServices(officeLab(), (services) => (services?.dhcp ? { ...services, dhcp: { ...services.dhcp, pools: [pool] } } : services)),
    'pc2',
    { address: '' },
  )
}

/** Every lab of the golden tests by name. */
export function goldenLabs(): ReadonlyArray<readonly [string, NetworkState]> {
  return [
    ['officeLab', officeLab()],
    ['officeLab, WAN down', wanDown(officeLab())],
    ['officeLab, pc1 unplugged', unplug(officeLab(), 'pc1Link')],
    ['officeLab, pc2 port shut', shutPort(officeLab(), 'switch', 'Fa0/3')],
    ['officeLab, pc1 duplicates the printer', editNic(officeLab(), 'pc1', { address: '192.168.1.150' })],
    ['officeLab, router off', powerOff(officeLab(), 'router')],
    ['officeLab, pc2 without a lease', editNic(officeLab(), 'pc2', { address: '' })],
    ['officeLab, pool exhausted', exhaustedPool()],
    ['officeLab, pc1 gateway is the printer', editHost(officeLab(), 'pc1', { defaultGateway: '192.168.1.150' })],
    ['vlanLab', vlanLab()],
    ...goldenExercises.flatMap((entry) => [
      [`${entry.id} (start)`, entry.initial] as const,
      [`${entry.id} (fixed)`, entry.fixed] as const,
    ]),
  ]
}
