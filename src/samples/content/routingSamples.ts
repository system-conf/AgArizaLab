// Routing samples (docs/SAMPLE_LABS.md "Routing"): static and default routes, floating static route,
// routing loop.
import { defaultRouteVia, routedPort, routes, routeTo, wanPort } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import type { SampleDefinition } from '../contract'
import { finishLab, MASK_24, MASK_30, online, reaches, staticNic, withUnplugged } from './sampleKit'

const ANY = '0.0.0.0'

export const routingStaticDefault: SampleDefinition = {
  id: 'routingStaticDefault',
  category: 'routing',
  order: 1,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3501)
        .add('internetCloud', 'isp', { x: 780, y: 40 })
        .add(
          'router3Port',
          'r1',
          { x: 540, y: 80 },
          routedPort('Gi0/0', '192.168.1.1'),
          wanPort('Gi0/1'),
          routedPort('Gi0/2', '10.0.0.1', MASK_30),
          routes([defaultRouteVia('Gi0/1')]),
        )
        .add('router2Port', 'r2', { x: 220, y: 80 }, routedPort('Gi0/0', '10.0.0.2', MASK_30), routedPort('Gi0/1', '192.168.2.1'), routes([]))
        .add('switch8', 'sw1', { x: 540, y: 220 })
        .add('switch8', 'sw2', { x: 220, y: 220 })
        .add('pc', 'pc1', { x: 540, y: 380 }, staticNic('192.168.1.10', undefined, '192.168.1.1', ['8.8.8.8']))
        .add('pc', 'pc2', { x: 220, y: 380 }, staticNic('192.168.2.10', undefined, '192.168.2.1', ['8.8.8.8']))
        .cable('wan', ['isp', 'eth0'], ['r1', 'Gi0/1'])
        .cable('siteLink', ['r1', 'Gi0/2'], ['r2', 'Gi0/0'])
        .cable('lan1Uplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('lan2Uplink', ['r2', 'Gi0/1'], ['sw2', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw2', 'Fa0/1']),
    ),
  steps: [
    { id: 'readTable', focusDeviceId: 'r1' },
    { id: 'staticBothWays', focusDeviceId: 'r1', checks: [reaches('pc1', 'pc2'), reaches('pc2', 'pc1')] },
    { id: 'defaultOnR2', focusDeviceId: 'r2', checks: [online('pc2')] },
    { id: 'tracertInternet', focusDeviceId: 'pc2' },
  ],
  breakIt: ['wrongNextHop', 'removeReturnRoute'],
  related: [
    { kind: 'sample', sampleId: 'routingFloatingStatic' },
    { kind: 'sample', sampleId: 'basicsGateway' },
    { kind: 'design', briefId: 'hotel' },
  ],
}

export const routingFloatingStatic: SampleDefinition = {
  id: 'routingFloatingStatic',
  category: 'routing',
  order: 2,
  level: 'advanced',
  features: [],
  lab: () =>
    withUnplugged(
      finishLab(
        new LabBuilder(3502)
          .add(
            'router3Port',
            'r1',
            { x: 200, y: 80 },
            routedPort('Gi0/0', '192.168.1.1'),
            routedPort('Gi0/1', '10.0.12.1', MASK_30),
            routedPort('Gi0/2', '10.0.13.1', MASK_30),
            routes([routeTo('192.168.2.0', MASK_24, '10.0.12.2')]),
          )
          .add(
            'router3Port',
            'r2',
            { x: 620, y: 80 },
            routedPort('Gi0/0', '192.168.2.1'),
            routedPort('Gi0/1', '10.0.12.2', MASK_30),
            routedPort('Gi0/2', '10.0.23.2', MASK_30),
            routes([routeTo('192.168.1.0', MASK_24, '10.0.12.1'), routeTo('192.168.1.0', MASK_24, '10.0.23.1', 5)]),
          )
          .add(
            'router2Port',
            'r3',
            { x: 410, y: 260 },
            routedPort('Gi0/0', '10.0.13.2', MASK_30),
            routedPort('Gi0/1', '10.0.23.1', MASK_30),
            routes([routeTo('192.168.1.0', MASK_24, '10.0.13.1'), routeTo('192.168.2.0', MASK_24, '10.0.23.2')]),
          )
          .add('pc', 'pc1', { x: 80, y: 260 }, staticNic('192.168.1.10', undefined, '192.168.1.1'))
          .add('pc', 'pc2', { x: 740, y: 260 }, staticNic('192.168.2.10', undefined, '192.168.2.1'))
          .cable('primary', ['r1', 'Gi0/1'], ['r2', 'Gi0/1'])
          .cable('backupR1', ['r1', 'Gi0/2'], ['r3', 'Gi0/0'])
          .cable('backupR2', ['r3', 'Gi0/1'], ['r2', 'Gi0/2'])
          .cable('pc1Link', ['pc1', 'eth0'], ['r1', 'Gi0/0'])
          .cable('pc2Link', ['pc2', 'eth0'], ['r2', 'Gi0/0']),
      ),
      // The primary line is down when the lab opens ("the fibre was cut this morning").
      ['primary'],
    ),
  steps: [
    { id: 'outage', focusDeviceId: 'r1' },
    { id: 'addFloating', focusDeviceId: 'r1', checks: [reaches('pc1', 'pc2'), reaches('pc2', 'pc1')] },
    { id: 'restorePrimary', focusDeviceId: 'pc1' },
    { id: 'failover', mode: 'simulation', focusDeviceId: 'r1' },
  ],
  breakIt: ['noReturnBackup', 'shutInterface'],
  related: [
    { kind: 'sample', sampleId: 'routingStaticDefault' },
    { kind: 'sample', sampleId: 'routingLoop' },
  ],
}

export const routingLoop: SampleDefinition = {
  id: 'routingLoop',
  category: 'routing',
  order: 3,
  level: 'advanced',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3503)
        .add('router2Port', 'r1', { x: 120, y: 80 }, routedPort('Gi0/0', '192.168.1.1'), routedPort('Gi0/1', '10.0.12.1', MASK_30), routes([routeTo(ANY, ANY, '10.0.12.2')]))
        .add(
          'router2Port',
          'r2',
          { x: 400, y: 80 },
          routedPort('Gi0/0', '10.0.12.2', MASK_30),
          routedPort('Gi0/1', '10.0.23.1', MASK_30),
          // Typo: 192.168.3.0/24 points back to R1 instead of R3.
          routes([routeTo('192.168.1.0', MASK_24, '10.0.12.1'), routeTo('192.168.3.0', MASK_24, '10.0.12.1')]),
        )
        .add('router2Port', 'r3', { x: 680, y: 80 }, routedPort('Gi0/0', '10.0.23.2', MASK_30), routedPort('Gi0/1', '192.168.3.1'), routes([routeTo(ANY, ANY, '10.0.23.1')]))
        .add('pc', 'pc1', { x: 120, y: 260 }, staticNic('192.168.1.10', undefined, '192.168.1.1'))
        .add('pc', 'pc2', { x: 680, y: 260 }, staticNic('192.168.3.10', undefined, '192.168.3.1'))
        .cable('r1r2', ['r1', 'Gi0/1'], ['r2', 'Gi0/0'])
        .cable('r2r3', ['r2', 'Gi0/1'], ['r3', 'Gi0/0'])
        .cable('pc1Link', ['pc1', 'eth0'], ['r1', 'Gi0/0'])
        .cable('pc2Link', ['pc2', 'eth0'], ['r3', 'Gi0/1']),
    ),
  steps: [
    { id: 'tracertLoop', focusDeviceId: 'pc1' },
    { id: 'watchTtl', mode: 'simulation', focusDeviceId: 'r2' },
    { id: 'fixRoute', focusDeviceId: 'r2', checks: [reaches('pc1', 'pc2'), reaches('pc2', 'pc1')] },
  ],
  breakIt: ['deleteRoute', 'defaultsFacingEachOther'],
  related: [
    { kind: 'sample', sampleId: 'packetTtlTracert' },
    { kind: 'sample', sampleId: 'routingFloatingStatic' },
  ],
}

export const routingSamples: readonly SampleDefinition[] = [routingStaticDefault, routingFloatingStatic, routingLoop]
