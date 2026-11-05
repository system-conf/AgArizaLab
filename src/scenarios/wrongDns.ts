import type { ScenarioDefinition } from '../domain/ScenarioTypes'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const wrongDns: ScenarioDefinition = {
  id: 'wrongDns',
  order: 5,
  setting: 'ofis',
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'internet',
        mac: '00:00:5E:00:05:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'router',
        mac: '00:1A:2B:50:00:01',
        position: { x: 500, y: 180 },
        powered: true,
        routerInterfaces: [{ id: 'LAN.1', vlan: 1, ip: '192.168.1.1', mask }],
        dhcpPools: [
          {
            id: 'lanPool',
            vlan: 1,
            rangeStart: '192.168.1.100',
            rangeEnd: '192.168.1.200',
            mask,
            gateway: '192.168.1.1',
            dns: ['192.168.1.1'],
            leases: [{ mac: '00:1A:2B:50:00:22', ip: '192.168.1.101' }],
          },
        ],
        wanUp: true,
        dnsForwarding: true,
      },
      {
        id: 'switch',
        kind: 'switch',
        name: 'switch',
        mac: '00:1A:2B:50:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 1, false),
      },
      {
        id: 'muhasebe',
        kind: 'pc',
        name: 'muhasebe',
        mac: '00:1A:2B:50:00:21',
        position: { x: 330, y: 500 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.1.20',
          mask,
          gateway: '192.168.1.1',
          dns: ['192.168.1.254'],
        },
      },
      {
        id: 'satis',
        kind: 'pc',
        name: 'satis',
        mac: '00:1A:2B:50:00:22',
        position: { x: 670, y: 500 },
        powered: true,
        host: {
          mode: 'dhcp',
          ip: '192.168.1.101',
          mask,
          gateway: '192.168.1.1',
          dns: ['192.168.1.1'],
        },
      },
    ],
    links: [
      {
        id: 'internetToRouter',
        a: { deviceId: 'internet', portId: 'wan' },
        b: { deviceId: 'router', portId: 'wan' },
        connected: true,
      },
      {
        id: 'routerToSwitch',
        a: { deviceId: 'router', portId: 'lan' },
        b: { deviceId: 'switch', portId: 'Fa0/1' },
        connected: true,
      },
      {
        id: 'muhasebeToSwitch',
        a: { deviceId: 'muhasebe', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/2' },
        connected: true,
      },
      {
        id: 'satisToSwitch',
        a: { deviceId: 'satis', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/3' },
        connected: true,
      },
    ],
  },
  solvedWhen: [
    { type: 'resolves', fromDeviceId: 'muhasebe', name: 'google.com' },
    { type: 'internet', fromDeviceId: 'muhasebe' },
  ],
}
