// Packet view samples (docs/SAMPLE_LABS.md "Packet view", Phase 3 simulator): ARP step by step, MAC
// learning, TTL and tracert. Most steps are observations in Simulation mode (manual steps).
import { routedPort, routes, routeTo } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import type { SampleDefinition } from '../contract'
import { finishLab, MASK_24, MASK_30, reaches, staticNic, withUnplugged } from './sampleKit'

export const packetArp: SampleDefinition = {
  id: 'packetArp',
  category: 'packetView',
  order: 1,
  level: 'beginner',
  features: ['simulation'],
  lab: () =>
    finishLab(
      new LabBuilder(3601)
        .add('router2Port', 'r1', { x: 560, y: 60 }, routedPort('Gi0/0', '192.168.1.1'), routedPort('Gi0/1', '192.168.2.1'))
        .add('switch8', 'sw1', { x: 300, y: 160 })
        // PC1 has no default gateway yet.
        .add('pc', 'pc1', { x: 160, y: 320 }, staticNic('192.168.1.10'))
        .add('pc', 'pc2', { x: 400, y: 320 }, staticNic('192.168.1.20', undefined, '192.168.1.1'))
        .add('pc', 'pc3', { x: 720, y: 220 }, staticNic('192.168.2.10', undefined, '192.168.2.1'))
        .cable('uplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
        .cable('pc3Link', ['pc3', 'eth0'], ['r1', 'Gi0/1']),
    ),
  steps: [
    { id: 'arpRequest', mode: 'simulation', focusDeviceId: 'pc1' },
    { id: 'arpReply', mode: 'simulation', focusDeviceId: 'pc2' },
    { id: 'arpCache', focusDeviceId: 'pc1' },
    { id: 'gatewayArp', mode: 'simulation', focusDeviceId: 'pc1', checks: [reaches('pc1', 'pc3')] },
  ],
  breakIt: ['unplugPc2', 'otherSubnet'],
  related: [
    { kind: 'sample', sampleId: 'packetMacLearning' },
    { kind: 'sample', sampleId: 'basicsGateway' },
  ],
}

export const packetMacLearning: SampleDefinition = {
  id: 'packetMacLearning',
  category: 'packetView',
  order: 2,
  level: 'beginner',
  features: ['simulation'],
  lab: () =>
    withUnplugged(
      finishLab(
        new LabBuilder(3602)
          .add('switch8', 'sw1', { x: 260, y: 120 })
          .add('switch8', 'sw2', { x: 600, y: 120 })
          .add('pc', 'pc1', { x: 100, y: 300 }, staticNic('192.168.1.11'))
          .add('pc', 'pc2', { x: 260, y: 300 }, staticNic('192.168.1.12'))
          .add('pc', 'pc3', { x: 420, y: 300 }, staticNic('192.168.1.13'))
          .add('pc', 'pc4', { x: 600, y: 300 }, staticNic('192.168.1.14'))
          .cable('interSwitch', ['sw1', 'Fa0/8'], ['sw2', 'Fa0/8'])
          .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
          .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
          .cable('pc3Link', ['pc3', 'eth0'], ['sw1', 'Fa0/3'])
          .cable('pc4Link', ['pc4', 'eth0'], ['sw2', 'Fa0/1']),
      ),
      ['pc4Link'],
    ),
  steps: [
    { id: 'floodFirst', mode: 'simulation', focusDeviceId: 'sw1' },
    { id: 'learnedReply', mode: 'simulation', focusDeviceId: 'sw1' },
    { id: 'plugPc4', focusDeviceId: 'pc4', checks: [reaches('pc1', 'pc4')] },
    { id: 'uplinkLearning', mode: 'simulation', focusDeviceId: 'sw1' },
  ],
  breakIt: ['hubInstead', 'unplugLearned'],
  related: [
    { kind: 'sample', sampleId: 'packetArp' },
    { kind: 'sample', sampleId: 'switchingVlansTrunks' },
  ],
}

export const packetTtlTracert: SampleDefinition = {
  id: 'packetTtlTracert',
  category: 'packetView',
  order: 3,
  level: 'intermediate',
  features: ['simulation'],
  lab: () =>
    finishLab(
      new LabBuilder(3603)
        .add('router2Port', 'r1', { x: 180, y: 80 }, routedPort('Gi0/0', '192.168.1.1'), routedPort('Gi0/1', '10.0.12.1', MASK_30), routes([routeTo('0.0.0.0', '0.0.0.0', '10.0.12.2')]))
        .add(
          'router2Port',
          'r2',
          { x: 400, y: 80 },
          routedPort('Gi0/0', '10.0.12.2', MASK_30),
          routedPort('Gi0/1', '10.0.23.1', MASK_30),
          routes([routeTo('192.168.1.0', MASK_24, '10.0.12.1'), routeTo('192.168.3.0', MASK_24, '10.0.23.2')]),
        )
        // R3 has no route back to 192.168.1.0/24 yet.
        .add('router2Port', 'r3', { x: 620, y: 80 }, routedPort('Gi0/0', '10.0.23.2', MASK_30), routedPort('Gi0/1', '192.168.3.1'), routes([]))
        .add('pc', 'pc1', { x: 60, y: 260 }, staticNic('192.168.1.10', undefined, '192.168.1.1'))
        .add('pc', 'pc2', { x: 740, y: 260 }, staticNic('192.168.3.10', undefined, '192.168.3.1'))
        .cable('r1r2', ['r1', 'Gi0/1'], ['r2', 'Gi0/0'])
        .cable('r2r3', ['r2', 'Gi0/1'], ['r3', 'Gi0/0'])
        .cable('pc1Link', ['pc1', 'eth0'], ['r1', 'Gi0/0'])
        .cable('pc2Link', ['pc2', 'eth0'], ['r3', 'Gi0/1']),
    ),
  steps: [
    { id: 'tracertStops', focusDeviceId: 'pc1' },
    { id: 'addReturnRoute', focusDeviceId: 'r3', checks: [reaches('pc1', 'pc2'), reaches('pc2', 'pc1')] },
    { id: 'watchTtl', mode: 'simulation', focusDeviceId: 'pc1' },
    { id: 'replyTtl', focusDeviceId: 'pc1' },
  ],
  breakIt: ['removeMiddleRoute', 'makeLoop'],
  related: [
    { kind: 'sample', sampleId: 'routingLoop' },
    { kind: 'sample', sampleId: 'routingStaticDefault' },
  ],
}

export const packetViewSamples: readonly SampleDefinition[] = [packetArp, packetMacLearning, packetTtlTracert]
