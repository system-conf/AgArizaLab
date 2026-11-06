// Basics samples (docs/SAMPLE_LABS.md "Basics"): two PCs and a switch, subnets and masks, default
// gateway, IP conflict, APIPA. Texts: `samples:labs.<id>.*`.
import { routedPort } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import type { SampleDefinition } from '../contract'
import { dhcpService, finishLab, hasAddress, not, pool, poweredOff, reaches, staticNic } from './sampleKit'

export const basicsTwoPcs: SampleDefinition = {
  id: 'basicsTwoPcs',
  category: 'basics',
  order: 1,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3101)
        .add('switch8', 'sw1', { x: 360, y: 120 })
        .add('pc', 'pc1', { x: 200, y: 300 }, staticNic('192.168.1.10'))
        .add('pc', 'pc2', { x: 520, y: 300 })
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'readAddress', focusDeviceId: 'pc1' },
    { id: 'addressPc2', focusDeviceId: 'pc2', checks: [reaches('pc1', 'pc2'), reaches('pc2', 'pc1')] },
    { id: 'watchPing', mode: 'simulation', focusDeviceId: 'pc1' },
  ],
  breakIt: ['unplugCable', 'otherNetwork'],
  related: [
    { kind: 'sample', sampleId: 'basicsSubnets' },
    { kind: 'sample', sampleId: 'packetArp' },
  ],
}

export const basicsSubnets: SampleDefinition = {
  id: 'basicsSubnets',
  category: 'basics',
  order: 2,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3102)
        .add('switch8', 'sw1', { x: 360, y: 120 })
        .add('pc', 'pc1', { x: 160, y: 300 }, staticNic('192.168.10.10'))
        .add('pc', 'pc2', { x: 360, y: 300 }, staticNic('192.168.10.200'))
        .add('pc', 'pc3', { x: 560, y: 300 }, staticNic('192.168.10.140', '255.255.255.128'))
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
        .cable('pc3Link', ['pc3', 'eth0'], ['sw1', 'Fa0/3']),
    ),
  steps: [
    { id: 'compareMasks', focusDeviceId: 'pc3' },
    { id: 'fixMask', focusDeviceId: 'pc3', checks: [reaches('pc3', 'pc1')] },
    {
      id: 'splitSubnets',
      focusDeviceId: 'pc2',
      checks: [
        { type: 'network', condition: { type: 'separateSubnets', groupA: 'pc1', groupB: 'pc2' } },
        hasAddress('pc2', '192.168.20.0/24'),
        not(reaches('pc1', 'pc2')),
      ],
    },
  ],
  breakIt: ['tinyMask', 'broadcastAddress'],
  related: [
    { kind: 'sample', sampleId: 'basicsGateway' },
    { kind: 'exercise', exerciseId: 'cameraSubnet' },
  ],
}

export const basicsGateway: SampleDefinition = {
  id: 'basicsGateway',
  category: 'basics',
  order: 3,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3103)
        .add('router2Port', 'r1', { x: 360, y: 60 }, routedPort('Gi0/0', '192.168.1.1'), routedPort('Gi0/1', '192.168.2.1'))
        .add('switch8', 'sw1', { x: 180, y: 200 })
        .add('switch8', 'sw2', { x: 540, y: 200 })
        .add('pc', 'pc1', { x: 180, y: 360 }, staticNic('192.168.1.10', undefined, '192.168.1.1'))
        .add('pc', 'pc2', { x: 540, y: 360 }, staticNic('192.168.2.10'))
        .cable('r1Lan1', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('r1Lan2', ['r1', 'Gi0/1'], ['sw2', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw2', 'Fa0/1']),
    ),
  steps: [
    { id: 'pingGateway', focusDeviceId: 'pc1' },
    { id: 'setGateway', focusDeviceId: 'pc2', checks: [reaches('pc1', 'pc2'), reaches('pc2', 'pc1')] },
    { id: 'tracertHops', focusDeviceId: 'pc1' },
  ],
  breakIt: ['wrongGateway', 'gatewayElsewhere'],
  related: [
    { kind: 'sample', sampleId: 'routingStaticDefault' },
    { kind: 'exercise', exerciseId: 'posGateway' },
  ],
}

export const basicsIpConflict: SampleDefinition = {
  id: 'basicsIpConflict',
  category: 'basics',
  order: 4,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3104)
        .add('switch8', 'sw1', { x: 360, y: 120 })
        .add('pc', 'pc1', { x: 160, y: 300 }, staticNic('192.168.1.10'))
        .add('pc', 'pc2', { x: 360, y: 300 }, staticNic('192.168.1.20'))
        .add('pc', 'pc3', { x: 560, y: 300 }, staticNic('192.168.1.10'))
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
        .cable('pc3Link', ['pc3', 'eth0'], ['sw1', 'Fa0/3']),
    ),
  steps: [
    { id: 'spotConflict', focusDeviceId: 'pc1' },
    { id: 'fixConflict', focusDeviceId: 'pc3', checks: [reaches('pc1', 'pc2'), reaches('pc3', 'pc2')] },
    { id: 'watchProbe', mode: 'simulation', focusDeviceId: 'pc3' },
  ],
  breakIt: ['powerOffPc1', 'otherMask'],
  related: [
    { kind: 'sample', sampleId: 'dhcpConflict' },
    { kind: 'sample', sampleId: 'basicsTwoPcs' },
  ],
}

export const basicsApipa: SampleDefinition = {
  id: 'basicsApipa',
  category: 'basics',
  order: 5,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3105)
        .add('switch8', 'sw1', { x: 360, y: 120 })
        .add(
          'server',
          'dhcp1',
          { x: 620, y: 120 },
          staticNic('192.168.1.5'),
          dhcpService([{ ...pool('lan', '192.168.1.0', ''), range: { start: '192.168.1.100', end: '192.168.1.199' } }]),
          poweredOff(),
        )
        .add('pc', 'pc1', { x: 200, y: 300 })
        .add('pc', 'pc2', { x: 520, y: 300 })
        .cable('serverLink', ['dhcp1', 'eth0'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'seeApipa', focusDeviceId: 'pc1' },
    { id: 'startServer', focusDeviceId: 'dhcp1', checks: [hasAddress('pc1', '192.168.1.0/24')] },
    { id: 'pingNeighbour', focusDeviceId: 'pc2', checks: [hasAddress('pc2', '192.168.1.0/24'), reaches('pc2', 'pc1')] },
  ],
  breakIt: ['unplugServer', 'serverOffLater'],
  related: [
    { kind: 'sample', sampleId: 'dhcpRouterServer' },
    { kind: 'exercise', exerciseId: 'printerDhcp' },
  ],
}

export const basicsSamples: readonly SampleDefinition[] = [basicsTwoPcs, basicsSubnets, basicsGateway, basicsIpConflict, basicsApipa]
