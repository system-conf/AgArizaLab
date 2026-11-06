// DNS samples (docs/SAMPLE_LABS.md "DNS"): local server records, forwarders, multi-level DNS
// (a branch server forwarding to the head-office server, which forwards to a public resolver).
import { defaultRouteVia, routedPort, routes, routeTo, wanPort } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import type { SampleDefinition } from '../contract'
import { dnsService, finishLab, MASK_24, MASK_30, resolves, staticNic } from './sampleKit'

const INTRANET = 'intranet.office.lan'

export const dnsLocalRecords: SampleDefinition = {
  id: 'dnsLocalRecords',
  category: 'dns',
  order: 1,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3301)
        .add('switch8', 'sw1', { x: 380, y: 200 })
        .add('server', 'dns1', { x: 140, y: 60 }, staticNic('192.168.1.5'), dnsService([[INTRANET, '192.168.1.20']]))
        .add('server', 'web1', { x: 380, y: 40 }, staticNic('192.168.1.20'))
        .add('server', 'files1', { x: 620, y: 60 }, staticNic('192.168.1.30'))
        .add('pc', 'pc1', { x: 240, y: 360 }, staticNic('192.168.1.10', undefined, '', ['192.168.1.5']))
        .add('pc', 'pc2', { x: 520, y: 360 }, staticNic('192.168.1.11'))
        .cable('dnsLink', ['dns1', 'eth0'], ['sw1', 'Fa0/6'])
        .cable('webLink', ['web1', 'eth0'], ['sw1', 'Fa0/7'])
        .cable('filesLink', ['files1', 'eth0'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'resolveIntranet', focusDeviceId: 'pc1' },
    { id: 'addFilesRecord', focusDeviceId: 'dns1', checks: [resolves('pc1', 'files.office.lan')] },
    { id: 'pc2Dns', focusDeviceId: 'pc2', checks: [resolves('pc2', INTRANET)] },
    { id: 'pingByName', focusDeviceId: 'pc1' },
  ],
  breakIt: ['wrongRecord', 'dnsServerOff'],
  related: [
    { kind: 'sample', sampleId: 'dnsForwarders' },
    { kind: 'exercise', exerciseId: 'wrongDns' },
  ],
}

export const dnsForwarders: SampleDefinition = {
  id: 'dnsForwarders',
  category: 'dns',
  order: 2,
  level: 'intermediate',
  features: ['dnsForwarding', 'simulation'],
  lab: () =>
    finishLab(
      new LabBuilder(3302)
        .add('internetCloud', 'isp', { x: 660, y: 40 })
        .add('router2Port', 'r1', { x: 380, y: 60 }, routedPort('Gi0/0', '192.168.1.1'), wanPort('Gi0/1'), routes([defaultRouteVia('Gi0/1')]))
        .add('switch8', 'sw1', { x: 380, y: 200 })
        .add('server', 'dns1', { x: 140, y: 200 }, staticNic('192.168.1.5', undefined, '192.168.1.1'), dnsService([[INTRANET, '192.168.1.20']]))
        .add('server', 'web1', { x: 620, y: 200 }, staticNic('192.168.1.20', undefined, '192.168.1.1'))
        .add('pc', 'pc1', { x: 380, y: 360 }, staticNic('192.168.1.10', undefined, '192.168.1.1', ['192.168.1.5']))
        .cable('wan', ['isp', 'eth0'], ['r1', 'Gi0/1'])
        .cable('uplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('dnsLink', ['dns1', 'eth0'], ['sw1', 'Fa0/6'])
        .cable('webLink', ['web1', 'eth0'], ['sw1', 'Fa0/7'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1']),
    ),
  steps: [
    { id: 'localName', focusDeviceId: 'pc1' },
    { id: 'addForwarder', focusDeviceId: 'dns1', checks: [resolves('pc1', 'google.com')] },
    { id: 'watchForwarding', mode: 'simulation', focusDeviceId: 'dns1' },
    { id: 'backupForwarder', focusDeviceId: 'dns1' },
  ],
  breakIt: ['wrongForwarder', 'wanUnplugged'],
  related: [
    { kind: 'sample', sampleId: 'dnsLocalRecords' },
    { kind: 'sample', sampleId: 'dnsMultiLevel' },
    { kind: 'exercise', exerciseId: 'wrongDns' },
  ],
}

export const dnsMultiLevel: SampleDefinition = {
  id: 'dnsMultiLevel',
  category: 'dns',
  order: 3,
  level: 'advanced',
  features: ['dnsForwarding', 'simulation'],
  lab: () =>
    finishLab(
      new LabBuilder(3303)
        .add('internetCloud', 'isp', { x: 820, y: 40 })
        .add(
          'router3Port',
          'r1',
          { x: 580, y: 60 },
          routedPort('Gi0/0', '192.168.1.1'),
          wanPort('Gi0/1'),
          routedPort('Gi0/2', '10.0.0.1', MASK_30),
          routes([defaultRouteVia('Gi0/1'), routeTo('192.168.2.0', MASK_24, '10.0.0.2')]),
        )
        .add('router2Port', 'r2', { x: 220, y: 60 }, routedPort('Gi0/0', '10.0.0.2', MASK_30), routedPort('Gi0/1', '192.168.2.1'), routes([routeTo('0.0.0.0', '0.0.0.0', '10.0.0.1')]))
        .add('switch8', 'sw1', { x: 580, y: 220 })
        .add('switch8', 'sw2', { x: 220, y: 220 })
        .add('server', 'dnsHq', { x: 500, y: 380 }, staticNic('192.168.1.5', undefined, '192.168.1.1'), dnsService([[INTRANET, '192.168.1.20']]))
        .add('server', 'web1', { x: 680, y: 380 }, staticNic('192.168.1.20', undefined, '192.168.1.1'))
        .add('server', 'dnsBr', { x: 80, y: 380 }, staticNic('192.168.2.5', undefined, '192.168.2.1'), dnsService([['pc2.branch.office.lan', '192.168.2.11']]))
        .add('pc', 'pc1', { x: 220, y: 380 }, staticNic('192.168.2.10', undefined, '192.168.2.1', ['192.168.2.5']))
        .add('pc', 'pc2', { x: 360, y: 380 }, staticNic('192.168.2.11', undefined, '192.168.2.1', ['192.168.2.5']))
        .cable('wan', ['isp', 'eth0'], ['r1', 'Gi0/1'])
        .cable('siteLink', ['r1', 'Gi0/2'], ['r2', 'Gi0/0'])
        .cable('hqUplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('branchUplink', ['r2', 'Gi0/1'], ['sw2', 'Fa0/8'])
        .cable('dnsHqLink', ['dnsHq', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('webLink', ['web1', 'eth0'], ['sw1', 'Fa0/2'])
        .cable('dnsBrLink', ['dnsBr', 'eth0'], ['sw2', 'Fa0/3'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw2', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw2', 'Fa0/2']),
      { dnsHq: 'DNS-HQ', dnsBr: 'DNS-BR' },
    ),
  steps: [
    { id: 'branchLocal', focusDeviceId: 'pc1' },
    { id: 'forwardToHq', focusDeviceId: 'dnsBr', checks: [resolves('pc1', INTRANET)] },
    { id: 'hqForwarder', focusDeviceId: 'dnsHq', checks: [resolves('pc1', 'google.com')] },
    { id: 'watchChain', mode: 'simulation', focusDeviceId: 'dnsBr' },
  ],
  breakIt: ['forwardLoop', 'siteLinkDown'],
  related: [
    { kind: 'sample', sampleId: 'dnsForwarders' },
    { kind: 'sample', sampleId: 'routingStaticDefault' },
  ],
}

export const dnsSamples: readonly SampleDefinition[] = [dnsLocalRecords, dnsForwarders, dnsMultiLevel]
