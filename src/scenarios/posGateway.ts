import type { V1ScenarioDefinition } from '../lab/migrations/v1Types'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const posGateway: V1ScenarioDefinition = {
  id: 'posGateway',
  order: 1,
  setting: 'restoran',
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'internet',
        mac: '00:00:5E:00:01:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'router',
        mac: '00:1A:2B:10:00:01',
        position: { x: 500, y: 180 },
        powered: true,
        routerInterfaces: [{ id: 'LAN.1', vlan: 1, ip: '192.168.10.1', mask }],
        dhcpPools: [
          {
            id: 'lanPool',
            vlan: 1,
            rangeStart: '192.168.10.100',
            rangeEnd: '192.168.10.200',
            mask,
            gateway: '192.168.10.1',
            dns: ['192.168.10.1'],
            leases: [
              { mac: '00:1A:2B:10:00:21', ip: '192.168.10.101' },
              { mac: '00:1A:2B:10:00:22', ip: '192.168.10.102' },
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
        mac: '00:1A:2B:10:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 1, false),
      },
      {
        id: 'kasa',
        kind: 'pos',
        name: 'kasa',
        mac: '00:1A:2B:10:00:20',
        position: { x: 250, y: 500 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.10.20',
          mask,
          gateway: '192.168.1.1',
          dns: ['8.8.8.8'],
        },
      },
      {
        id: 'mutfakEkrani',
        kind: 'kitchenDisplay',
        name: 'mutfakEkrani',
        mac: '00:1A:2B:10:00:21',
        position: { x: 500, y: 500 },
        powered: true,
        host: {
          mode: 'dhcp',
          ip: '192.168.10.101',
          mask,
          gateway: '192.168.10.1',
          dns: ['192.168.10.1'],
        },
      },
      {
        id: 'mudurPc',
        kind: 'pc',
        name: 'mudurPc',
        mac: '00:1A:2B:10:00:22',
        position: { x: 750, y: 500 },
        powered: true,
        host: {
          mode: 'dhcp',
          ip: '192.168.10.102',
          mask,
          gateway: '192.168.10.1',
          dns: ['192.168.10.1'],
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
        id: 'kasaToSwitch',
        a: { deviceId: 'kasa', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/2' },
        connected: true,
      },
      {
        id: 'mutfakEkraniToSwitch',
        a: { deviceId: 'mutfakEkrani', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/3' },
        connected: true,
      },
      {
        id: 'mudurPcToSwitch',
        a: { deviceId: 'mudurPc', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/4' },
        connected: true,
      },
    ],
  },
  solvedWhen: [
    { type: 'internet', fromDeviceId: 'kasa' },
    { type: 'resolves', fromDeviceId: 'kasa', name: 'odeme.ornekbanka.com.tr' },
  ],
}
