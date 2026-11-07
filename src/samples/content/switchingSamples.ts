// Switching samples (docs/SAMPLE_LABS.md "Switching"): VLANs and trunks, native VLAN mismatch,
// allowed VLANs, inter-VLAN routing with router-on-a-stick and with SVIs on a layer-3 switch.
import { accessPorts, subInterfaces, svis, trunkPorts, vlans } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import type { SampleDefinition } from '../contract'
import { dhcpService, dnsService, finishLab, leasedNic, macOf, nativeVlanMatch, pool, reaches, resolves, staticNic, trunkDetails, vlanEntries, withLease } from './sampleKit'

const NAMES = { 10: 'STAFF', 20: 'GUESTS', 30: 'PRINTERS', 99: 'NATIVE' } as const

/** Two switches joined on Fa0/8, two PCs on each (Fa0/1, Fa0/2); `edit` configures the switches. */
function twoSwitches(seed: number, addresses: readonly [string, string, string, string]): LabBuilder {
  const [pc1, pc2, pc3, pc4] = addresses
  return new LabBuilder(seed)
    .add('switch8', 'sw1', { x: 220, y: 120 })
    .add('switch8', 'sw2', { x: 560, y: 120 })
    .add('pc', 'pc1', { x: 120, y: 320 }, staticNic(pc1))
    .add('pc', 'pc2', { x: 300, y: 320 }, staticNic(pc2))
    .add('pc', 'pc3', { x: 480, y: 320 }, staticNic(pc3))
    .add('pc', 'pc4', { x: 660, y: 320 }, staticNic(pc4))
    .cable('interSwitch', ['sw1', 'Fa0/8'], ['sw2', 'Fa0/8'])
    .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
    .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
    .cable('pc3Link', ['pc3', 'eth0'], ['sw2', 'Fa0/1'])
    .cable('pc4Link', ['pc4', 'eth0'], ['sw2', 'Fa0/2'])
}

export const switchingVlansTrunks: SampleDefinition = {
  id: 'switchingVlansTrunks',
  category: 'switching',
  order: 1,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      twoSwitches(3401, ['192.168.10.11', '192.168.20.11', '192.168.10.12', '192.168.20.12'])
        .edit('sw1', vlans(vlanEntries([10, 20], NAMES)), accessPorts(['Fa0/1'], 10), accessPorts(['Fa0/2'], 20))
        // VLAN 20 was never created on SW2: its Fa0/2 is inactive. The uplink is still an access port.
        .edit('sw2', vlans(vlanEntries([10], NAMES)), accessPorts(['Fa0/1'], 10), accessPorts(['Fa0/2'], 20)),
    ),
  steps: [
    { id: 'makeTrunk', focusDeviceId: 'sw1', checks: [reaches('pc1', 'pc3')] },
    { id: 'createVlan20', focusDeviceId: 'sw2', checks: [reaches('pc2', 'pc4')] },
    { id: 'vlansIsolated', focusDeviceId: 'pc1' },
    { id: 'watchTag', mode: 'simulation', focusDeviceId: 'sw1' },
  ],
  breakIt: ['deleteVlan10', 'accessUplink'],
  related: [
    { kind: 'sample', sampleId: 'switchingAllowedVlans' },
    { kind: 'exercise', exerciseId: 'kitchenVlan' },
    { kind: 'design', briefId: 'hotel' },
  ],
}

export const switchingNativeVlan: SampleDefinition = {
  id: 'switchingNativeVlan',
  category: 'switching',
  order: 2,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      twoSwitches(3402, ['192.168.1.11', '192.168.10.11', '192.168.1.12', '192.168.10.12'])
        .edit('sw1', vlans(vlanEntries([10, 99], NAMES)), accessPorts(['Fa0/2'], 10), trunkPorts(['Fa0/8']), trunkDetails('Fa0/8', 99))
        // SW2's trunk kept the default native VLAN 1: a native VLAN mismatch.
        .edit('sw2', vlans(vlanEntries([10, 99], NAMES)), accessPorts(['Fa0/2'], 10), trunkPorts(['Fa0/8'])),
    ),
  steps: [
    { id: 'compareTrunks', focusDeviceId: 'sw2' },
    { id: 'watchReply', mode: 'simulation', focusDeviceId: 'pc1' },
    // A ping alone also passes when the uplink stops being a trunk (VLAN 10 breaks then): check the trunks too.
    { id: 'fixNative', focusDeviceId: 'sw2', checks: [nativeVlanMatch('interSwitch'), reaches('pc1', 'pc3'), reaches('pc3', 'pc1')] },
    { id: 'taggedFine', focusDeviceId: 'pc2' },
  ],
  breakIt: ['vlanLeak', 'bothDefault'],
  related: [
    { kind: 'sample', sampleId: 'switchingVlansTrunks' },
    { kind: 'sample', sampleId: 'switchingAllowedVlans' },
  ],
}

export const switchingAllowedVlans: SampleDefinition = {
  id: 'switchingAllowedVlans',
  category: 'switching',
  order: 3,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      twoSwitches(3403, ['192.168.10.11', '192.168.20.11', '192.168.10.12', '192.168.20.12'])
        .edit('sw1', vlans(vlanEntries([10, 20], NAMES)), accessPorts(['Fa0/1'], 10), accessPorts(['Fa0/2'], 20), trunkPorts(['Fa0/8']), trunkDetails('Fa0/8', 1, [10]))
        .edit('sw2', vlans(vlanEntries([10, 20], NAMES)), accessPorts(['Fa0/1'], 10), accessPorts(['Fa0/2'], 20), trunkPorts(['Fa0/8']), trunkDetails('Fa0/8', 1, [10])),
    ),
  steps: [
    { id: 'readAllowed', focusDeviceId: 'sw1' },
    { id: 'watchDrop', mode: 'simulation', focusDeviceId: 'pc2' },
    { id: 'allowVlan20', focusDeviceId: 'sw1', checks: [reaches('pc2', 'pc4'), reaches('pc1', 'pc3')] },
  ],
  breakIt: ['oneEndOnly', 'missingFromDatabase'],
  related: [
    { kind: 'sample', sampleId: 'switchingVlansTrunks' },
    { kind: 'sample', sampleId: 'switchingNativeVlan' },
  ],
}

export const switchingRouterOnAStick: SampleDefinition = {
  id: 'switchingRouterOnAStick',
  category: 'switching',
  order: 4,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3404)
        // Only Gi0/0.10 exists yet; VLAN 20 has no gateway.
        .add('router2Port', 'r1', { x: 380, y: 40 }, subInterfaces('Gi0/0', [{ vlan: 10, address: '192.168.10.1' }]))
        .add('switch8', 'sw1', { x: 380, y: 180 }, vlans(vlanEntries([10, 20], NAMES)), accessPorts(['Fa0/1'], 10), accessPorts(['Fa0/2'], 20), trunkPorts(['Fa0/8']))
        .add('pc', 'pc1', { x: 220, y: 340 }, staticNic('192.168.10.11', undefined, '192.168.10.1'))
        .add('pc', 'pc2', { x: 540, y: 340 }, staticNic('192.168.20.11', undefined, '192.168.20.1'))
        .cable('trunk', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'pingOwnGateway', focusDeviceId: 'pc1' },
    { id: 'addSubInterface', focusDeviceId: 'r1', checks: [reaches('pc2', 'pc1'), reaches('pc1', 'pc2')] },
    { id: 'tracertStick', focusDeviceId: 'pc1' },
    { id: 'watchTags', mode: 'simulation', focusDeviceId: 'sw1' },
  ],
  breakIt: ['accessUplink', 'wrongDot1q'],
  related: [
    { kind: 'sample', sampleId: 'switchingSvi' },
    { kind: 'exercise', exerciseId: 'kitchenVlan' },
    { kind: 'design', briefId: 'restaurant' },
  ],
}

export const switchingSvi: SampleDefinition = {
  id: 'switchingSvi',
  category: 'switching',
  order: 5,
  level: 'advanced',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3405)
        // `ip routing` is still off (the L3 switch default); Gi1/0/3 is in VLAN 1 and VLAN 30 does not exist.
        .add(
          'l3Switch24',
          'mls1',
          { x: 380, y: 120 },
          vlans(vlanEntries([10, 20], NAMES)),
          svis([
            { vlan: 10, address: '192.168.10.1' },
            { vlan: 20, address: '192.168.20.1' },
          ]),
          accessPorts(['Gi1/0/1'], 10),
          accessPorts(['Gi1/0/2'], 20),
        )
        .add('pc', 'pc1', { x: 180, y: 320 }, staticNic('192.168.10.11', undefined, '192.168.10.1'))
        .add('pc', 'pc2', { x: 380, y: 320 }, staticNic('192.168.20.11', undefined, '192.168.20.1'))
        .add('pc', 'pc3', { x: 580, y: 320 }, staticNic('192.168.30.11', undefined, '192.168.30.1'))
        .cable('pc1Link', ['pc1', 'eth0'], ['mls1', 'Gi1/0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['mls1', 'Gi1/0/2'])
        .cable('pc3Link', ['pc3', 'eth0'], ['mls1', 'Gi1/0/3']),
    ),
  steps: [
    { id: 'pingSvi', focusDeviceId: 'pc1' },
    { id: 'enableRouting', focusDeviceId: 'mls1', checks: [reaches('pc1', 'pc2'), reaches('pc2', 'pc1')] },
    { id: 'addVlan30', focusDeviceId: 'mls1', checks: [reaches('pc3', 'pc1')] },
    { id: 'compareStick', focusDeviceId: 'mls1' },
  ],
  breakIt: ['sviShutdown', 'deleteVlan10'],
  related: [
    { kind: 'sample', sampleId: 'switchingRouterOnAStick' },
    { kind: 'design', briefId: 'factory' },
  ],
}

/** Office VLAN 10, accounting VLAN 20; the DNS server sits in the office VLAN. */
const OFFICE_VLANS = { 10: 'OFFICE', 20: 'ACCOUNTING' } as const
const OFFICE_DNS = '192.168.10.10'
/** PC4's lease, from the accounting pool (it worked before its cable moved to Fa0/5). */
const PC4_ADDRESS = '192.168.20.12'

/**
 * A small office, ready to demo: R1 routes both VLANs (router-on-a-stick) and hands out addresses
 * by DHCP, DNS1 answers for sunucu.ofis. PC4 belongs to accounting (VLAN 20) but its switch port
 * Fa0/5 is still in VLAN 10, so its gateway never answers.
 */
function officeLab(): LabBuilder {
  const lab = new LabBuilder(3406)
    .add('router2Port', 'r1', { x: 400, y: 0 }, subInterfaces('Gi0/0', [{ vlan: 10, address: '192.168.10.1' }, { vlan: 20, address: '192.168.20.1' }]))
    .add(
      'switch8',
      'sw1',
      { x: 400, y: 210 },
      vlans(vlanEntries([10, 20], OFFICE_VLANS)),
      accessPorts(['Fa0/1', 'Fa0/2', 'Fa0/3'], 10),
      accessPorts(['Fa0/4'], 20),
      // The fault: Fa0/5 (PC4, accounting) was left in the office VLAN.
      accessPorts(['Fa0/5'], 10),
      trunkPorts(['Fa0/8']),
    )
    .add('pc', 'pc1', { x: 100, y: 420 }, leasedNic('192.168.10.11', '192.168.10.1', [OFFICE_DNS]))
    .add('pc', 'pc2', { x: 250, y: 420 }, leasedNic('192.168.10.12', '192.168.10.1', [OFFICE_DNS]))
    .add('server', 'dns1', { x: 400, y: 420 }, staticNic(OFFICE_DNS, undefined, '192.168.10.1'), dnsService([['sunucu.ofis', OFFICE_DNS]]))
    .add('pc', 'pc3', { x: 550, y: 420 }, leasedNic('192.168.20.11', '192.168.20.1', [OFFICE_DNS]))
    .add('pc', 'pc4', { x: 700, y: 420 }, leasedNic(PC4_ADDRESS, '192.168.20.1', [OFFICE_DNS]))
    .cable('trunk', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
    .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
    .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
    .cable('dns1Link', ['dns1', 'eth0'], ['sw1', 'Fa0/3'])
    .cable('pc3Link', ['pc3', 'eth0'], ['sw1', 'Fa0/4'])
    .cable('pc4Link', ['pc4', 'eth0'], ['sw1', 'Fa0/5'])
  lab.edit(
    'r1',
    dhcpService([pool('OFFICE', '192.168.10.0', '192.168.10.1', [OFFICE_DNS]), pool('ACCOUNTING', '192.168.20.0', '192.168.20.1', [OFFICE_DNS])], [
      { start: '192.168.10.1', end: '192.168.10.10' },
      { start: '192.168.20.1', end: '192.168.20.10' },
    ]),
  )
  lab.edit('r1', withLease('OFFICE', macOf(lab, 'pc1'), '192.168.10.11'), withLease('OFFICE', macOf(lab, 'pc2'), '192.168.10.12'))
  lab.edit('r1', withLease('ACCOUNTING', macOf(lab, 'pc3'), '192.168.20.11'), withLease('ACCOUNTING', macOf(lab, 'pc4'), PC4_ADDRESS))
  return lab
}

export const switchingOfficeWrongVlan: SampleDefinition = {
  id: 'switchingOfficeWrongVlan',
  category: 'switching',
  order: 6,
  level: 'beginner',
  features: [],
  lab: () => finishLab(officeLab()),
  groups: [{ id: 'accounting', name: 'accounting', deviceIds: ['pc3', 'pc4'] }],
  steps: [
    { id: 'seeFault', focusDeviceId: 'pc4' },
    { id: 'traceFault', mode: 'simulation', focusDeviceId: 'pc4' },
    {
      id: 'fixVlan',
      focusDeviceId: 'sw1',
      checks: [{ type: 'network', condition: { type: 'sameVlan', group: 'accounting' } }, reaches('pc4', 'r1'), reaches('pc4', 'dns1')],
    },
    { id: 'verifyName', focusDeviceId: 'pc4', checks: [resolves('pc4', 'sunucu.ofis')] },
  ],
  breakIt: ['renewInWrongVlan', 'dnsDown'],
  related: [
    { kind: 'exercise', exerciseId: 'kitchenVlan' },
    { kind: 'sample', sampleId: 'switchingRouterOnAStick' },
    { kind: 'design', briefId: 'smallOffice' },
  ],
}

export const switchingSamples: readonly SampleDefinition[] = [
  switchingVlansTrunks,
  switchingNativeVlan,
  switchingAllowedVlans,
  switchingRouterOnAStick,
  switchingSvi,
  switchingOfficeWrongVlan,
]
