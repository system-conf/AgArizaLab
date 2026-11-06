// Test-only (O3): the hint-3 fix of each of the five exercises (the edits of
// src/scenarios/scenarioBehaviour.test.ts), applied to the lab of its ExerciseDefinition.
import type { NetworkState } from '../../domain'
import { editAddress, editHost, editSwitchport } from '../../engine/testLabs'

const MASK = '255.255.255.0'

export const EXERCISE_FIXES: Readonly<Record<string, (state: NetworkState) => NetworkState>> = {
  posGateway: (state) => editHost(state, 'kasa', { defaultGateway: '192.168.10.1' }),
  printerDhcp: (state) =>
    editHost(editAddress(state, 'yazici', 'eth0', { addressing: 'static', address: '192.168.1.150', mask: MASK }), 'yazici', {
      defaultGateway: '192.168.1.1',
      dnsServers: ['192.168.1.1'],
    }),
  cameraSubnet: (state) =>
    editHost(editAddress(state, 'kamera3', 'eth0', { address: '192.168.1.63' }), 'kamera3', { defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1'] }),
  kitchenVlan: (state) => editSwitchport(state, 'switch', 'Fa0/3', { mode: 'access', accessVlan: 10 }),
  wrongDns: (state) => editHost(state, 'muhasebe', { dnsServers: ['192.168.1.1'] }),
}
