// DHCP samples (docs/SAMPLE_LABS.md "DHCP"): router as DHCP server, pools and exclusions,
// reservation-style mapping, relay (`ip helper-address`, Phase 3 simulator), DHCP conflict.
import { defaultRouteVia, dhcpServer, dnsProxy, lanPool, routedPort, routes, wanPort } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import type { SampleDefinition, SampleLab } from '../contract'
import { dhcpService, finishLab, hasAddress, helperAddress, leasedNic, macOf, not, online, pool, reaches, resolves, staticNic, withLease } from './sampleKit'

/** Statics live below .100: `ip dhcp excluded-address <net>.1 <net>.99`. */
function lowHundred(prefix: string): { start: string; end: string } {
  return { start: `${prefix}.1`, end: `${prefix}.99` }
}

export const dhcpRouterServer: SampleDefinition = {
  id: 'dhcpRouterServer',
  category: 'dhcp',
  order: 1,
  level: 'beginner',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3201)
        .add('internetCloud', 'isp', { x: 640, y: 40 })
        .add(
          'router2Port',
          'r1',
          { x: 360, y: 60 },
          routedPort('Gi0/0', '192.168.1.1'),
          wanPort('Gi0/1'),
          routes([defaultRouteVia('Gi0/1')]),
          dhcpServer([lanPool('LAN', '192.168.1')]),
          dnsProxy(),
        )
        .add('switch8', 'sw1', { x: 360, y: 200 })
        .add('pc', 'pc1', { x: 200, y: 360 })
        .add('pc', 'pc2', { x: 520, y: 360 })
        .cable('wan', ['isp', 'eth0'], ['r1', 'Gi0/1'])
        .cable('uplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'renewPc1', focusDeviceId: 'pc1', checks: [hasAddress('pc1', '192.168.1.0/24')] },
    { id: 'readLease', focusDeviceId: 'r1' },
    { id: 'pc2Online', focusDeviceId: 'pc2', checks: [online('pc2'), resolves('pc2', 'google.com')] },
    { id: 'releaseRenew', focusDeviceId: 'pc1' },
  ],
  breakIt: ['noDefaultRouter', 'lanPortDown'],
  related: [
    { kind: 'sample', sampleId: 'dhcpPoolsExclusions' },
    { kind: 'exercise', exerciseId: 'printerDhcp' },
    { kind: 'design', briefId: 'smallOffice' },
  ],
}

export const dhcpPoolsExclusions: SampleDefinition = {
  id: 'dhcpPoolsExclusions',
  category: 'dhcp',
  order: 2,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3202)
        .add(
          'router3Port',
          'r1',
          { x: 380, y: 60 },
          routedPort('Gi0/0', '192.168.10.1'),
          routedPort('Gi0/1', '192.168.20.1'),
          dhcpService([pool('OFFICE', '192.168.10.0', '192.168.10.1')]),
        )
        .add('switch8', 'sw1', { x: 200, y: 200 })
        .add('switch8', 'sw2', { x: 580, y: 200 })
        .add('pc', 'pc1', { x: 80, y: 360 })
        .add('pc', 'pc2', { x: 220, y: 360 })
        .add('printer', 'printer1', { x: 360, y: 360 }, staticNic('192.168.10.5', undefined, '192.168.10.1'))
        .add('pc', 'pc3', { x: 580, y: 360 })
        .cable('officeLink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('guestLink', ['r1', 'Gi0/1'], ['sw2', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
        .cable('printerLink', ['printer1', 'eth0'], ['sw1', 'Fa0/3'])
        .cable('pc3Link', ['pc3', 'eth0'], ['sw2', 'Fa0/1']),
    ),
  steps: [
    {
      id: 'excludeStatics',
      focusDeviceId: 'r1',
      checks: [hasAddress('pc1', '192.168.10.0/24'), not(hasAddress('pc1', '192.168.10.0/26'))],
    },
    { id: 'guestPool', focusDeviceId: 'r1', checks: [hasAddress('pc3', '192.168.20.0/24'), reaches('pc3', 'printer1')] },
    { id: 'readBindings', focusDeviceId: 'r1' },
  ],
  breakIt: ['excludeEverything', 'wrongPoolNetwork'],
  related: [
    { kind: 'sample', sampleId: 'dhcpRouterServer' },
    { kind: 'sample', sampleId: 'dhcpStaticMapping' },
    { kind: 'design', briefId: 'restaurant' },
  ],
}

function staticMappingLab(): SampleLab {
  const lab = new LabBuilder(3203)
    .add('router2Port', 'r1', { x: 360, y: 60 }, routedPort('Gi0/0', '192.168.1.1'), dhcpService([pool('LAN', '192.168.1.0', '192.168.1.1')], [lowHundred('192.168.1')]))
    .add('switch8', 'sw1', { x: 360, y: 200 })
    .add('server', 'nas1', { x: 600, y: 360 })
    .add('pc', 'pc1', { x: 160, y: 360 })
    .add('pc', 'pc2', { x: 360, y: 360 })
    .cable('uplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
    .cable('nasLink', ['nas1', 'eth0'], ['sw1', 'Fa0/3'])
    .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
    .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
  // The binding "NAS1's MAC → 192.168.1.200" is stored in the pool (a reservation-style mapping).
  lab.edit('r1', withLease('LAN', macOf(lab, 'nas1'), '192.168.1.200'))
  return finishLab(lab)
}

export const dhcpStaticMapping: SampleDefinition = {
  id: 'dhcpStaticMapping',
  category: 'dhcp',
  order: 3,
  level: 'intermediate',
  features: [],
  lab: staticMappingLab,
  steps: [
    { id: 'renewNas', focusDeviceId: 'nas1', checks: [hasAddress('nas1', '192.168.1.200/32')] },
    {
      id: 'renewPcs',
      focusDeviceId: 'pc1',
      checks: [hasAddress('pc1', '192.168.1.0/24'), hasAddress('pc2', '192.168.1.0/24'), reaches('pc1', 'nas1')],
    },
    { id: 'nasOff', focusDeviceId: 'nas1' },
    { id: 'releaseRenewNas', focusDeviceId: 'nas1' },
  ],
  breakIt: ['staticClash', 'newNas'],
  related: [
    { kind: 'sample', sampleId: 'dhcpPoolsExclusions' },
    { kind: 'sample', sampleId: 'dhcpConflict' },
  ],
}

export const dhcpRelay: SampleDefinition = {
  id: 'dhcpRelay',
  category: 'dhcp',
  order: 4,
  level: 'intermediate',
  features: ['dhcpRelay', 'simulation'],
  lab: () =>
    finishLab(
      new LabBuilder(3204)
        .add(
          'router2Port',
          'r1',
          { x: 380, y: 60 },
          routedPort('Gi0/0', '192.168.10.1'),
          helperAddress('Gi0/0', ['192.168.20.10']),
          routedPort('Gi0/1', '192.168.20.1'),
        )
        .add('switch8', 'sw1', { x: 200, y: 200 })
        .add('switch8', 'sw2', { x: 580, y: 200 })
        .add('pc', 'pc1', { x: 120, y: 360 })
        .add('pc', 'pc2', { x: 280, y: 360 })
        .add(
          'server',
          'dhcp1',
          { x: 580, y: 360 },
          staticNic('192.168.20.10', undefined, '192.168.20.1'),
          dhcpService([pool('CLIENTS', '192.168.10.0', '192.168.10.1')], [lowHundred('192.168.10')]),
        )
        .cable('clientsLink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('serversLink', ['r1', 'Gi0/1'], ['sw2', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
        .cable('serverLink', ['dhcp1', 'eth0'], ['sw2', 'Fa0/1']),
    ),
  steps: [
    { id: 'renewPc1', focusDeviceId: 'pc1', checks: [hasAddress('pc1', '192.168.10.0/24')] },
    { id: 'watchRelay', mode: 'simulation', focusDeviceId: 'r1' },
    { id: 'readServerPool', focusDeviceId: 'dhcp1' },
    { id: 'pc2Ping', focusDeviceId: 'pc2', checks: [hasAddress('pc2', '192.168.10.0/24'), reaches('pc2', 'dhcp1')] },
  ],
  breakIt: ['removeHelper', 'removePool', 'serverNoGateway'],
  related: [
    { kind: 'sample', sampleId: 'dhcpRouterServer' },
    { kind: 'design', briefId: 'schoolLab' },
  ],
}

function conflictLab(): SampleLab {
  const lab = new LabBuilder(3205)
    .add('router2Port', 'r1', { x: 360, y: 60 }, routedPort('Gi0/0', '192.168.1.1'), dhcpService([pool('LAN', '192.168.1.0', '192.168.1.1')], [lowHundred('192.168.1')]))
    .add('switch8', 'sw1', { x: 360, y: 200 })
    .add('pc', 'pc1', { x: 160, y: 360 }, leasedNic('192.168.1.100', '192.168.1.1'))
    .add('pc', 'pc2', { x: 360, y: 360 })
    .add('printer', 'printer1', { x: 560, y: 360 }, staticNic('192.168.1.100', undefined, '192.168.1.1'))
    .cable('uplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
    .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
    .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2'])
    .cable('printerLink', ['printer1', 'eth0'], ['sw1', 'Fa0/3'])
  // PC1 leased .100 earlier; later someone typed the same address into the printer.
  lab.edit('r1', withLease('LAN', macOf(lab, 'pc1'), '192.168.1.100'))
  return finishLab(lab)
}

export const dhcpConflict: SampleDefinition = {
  id: 'dhcpConflict',
  category: 'dhcp',
  order: 5,
  level: 'intermediate',
  features: [],
  lab: conflictLab,
  steps: [
    { id: 'spotDuplicate', focusDeviceId: 'pc1' },
    { id: 'renewPc1', focusDeviceId: 'pc1', checks: [hasAddress('pc1', '192.168.1.0/24'), reaches('pc1', 'r1')] },
    { id: 'movePrinter', focusDeviceId: 'printer1', checks: [hasAddress('printer1', '192.168.1.0/26'), reaches('pc1', 'printer1')] },
    { id: 'readBindings', focusDeviceId: 'r1' },
  ],
  breakIt: ['printerBack', 'pc2Static'],
  related: [
    { kind: 'sample', sampleId: 'basicsIpConflict' },
    { kind: 'sample', sampleId: 'dhcpStaticMapping' },
    { kind: 'exercise', exerciseId: 'printerDhcp' },
  ],
}

export const dhcpSamples: readonly SampleDefinition[] = [dhcpRouterServer, dhcpPoolsExclusions, dhcpStaticMapping, dhcpRelay, dhcpConflict]
