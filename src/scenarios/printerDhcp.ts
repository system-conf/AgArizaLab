import type { V1ScenarioDefinition } from '../lab/migrations/v1Types'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const printerDhcp: V1ScenarioDefinition = {
  id: 'printerDhcp',
  order: 2,
  setting: 'ofis',
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'internet',
        mac: '00:00:5E:00:02:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'router',
        mac: '00:1A:2B:20:00:01',
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
            leases: [
              { mac: '00:1A:2B:20:00:21', ip: '192.168.1.101' },
              { mac: '00:1A:2B:20:00:22', ip: '192.168.1.102' },
              { mac: '00:1A:2B:20:00:30', ip: '192.168.1.153' },
            ],
          },
        ],
        wanUp: true,
        dnsForwarding: true,
      },
      {
        id: 'switch',
        kind: 'switch',
        name: 'switch',
        mac: '00:1A:2B:20:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 1, false),
      },
      {
        id: 'muhasebe',
        kind: 'pc',
        name: 'muhasebe',
        mac: '00:1A:2B:20:00:21',
        position: { x: 250, y: 500 },
        powered: true,
        host: {
          mode: 'dhcp',
          ip: '192.168.1.101',
          mask,
          gateway: '192.168.1.1',
          dns: ['192.168.1.1'],
        },
        appLinks: [
          { id: 'yazici', label: 'yazici', targetIp: '192.168.1.150', targetKind: 'printer' },
        ],
      },
      {
        id: 'satis',
        kind: 'pc',
        name: 'satis',
        mac: '00:1A:2B:20:00:22',
        position: { x: 500, y: 500 },
        powered: true,
        host: {
          mode: 'dhcp',
          ip: '192.168.1.102',
          mask,
          gateway: '192.168.1.1',
          dns: ['192.168.1.1'],
        },
        appLinks: [
          { id: 'yazici', label: 'yazici', targetIp: '192.168.1.150', targetKind: 'printer' },
        ],
      },
      {
        id: 'yazici',
        kind: 'printer',
        name: 'yazici',
        mac: '00:1A:2B:20:00:30',
        position: { x: 750, y: 500 },
        powered: true,
        host: {
          mode: 'dhcp',
          ip: '192.168.1.153',
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
      {
        id: 'yaziciToSwitch',
        a: { deviceId: 'yazici', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/4' },
        connected: true,
      },
    ],
  },
  solvedWhen: [
    { type: 'appLinksOk', deviceId: 'muhasebe' },
    { type: 'appLinksOk', deviceId: 'satis' },
  ],
}
