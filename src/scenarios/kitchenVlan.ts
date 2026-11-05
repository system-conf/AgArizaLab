import type { ScenarioDefinition } from '../domain/ScenarioTypes'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const kitchenVlan: ScenarioDefinition = {
  id: 'kitchenVlan',
  order: 4,
  setting: 'restoran',
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'internet',
        mac: '00:00:5E:00:04:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'router',
        mac: '00:1A:2B:40:00:01',
        position: { x: 500, y: 180 },
        powered: true,
        routerInterfaces: [
          { id: 'LAN.10', vlan: 10, ip: '192.168.10.1', mask },
          { id: 'LAN.20', vlan: 20, ip: '192.168.20.1', mask },
        ],
        dhcpPools: [
          {
            id: 'isletmePool',
            vlan: 10,
            rangeStart: '192.168.10.100',
            rangeEnd: '192.168.10.200',
            mask,
            gateway: '192.168.10.1',
            dns: ['192.168.10.1'],
            leases: [],
          },
          {
            id: 'misafirPool',
            vlan: 20,
            rangeStart: '192.168.20.100',
            rangeEnd: '192.168.20.200',
            mask,
            gateway: '192.168.20.1',
            dns: ['192.168.20.1'],
            leases: [{ mac: '00:1A:2B:40:00:70', ip: '192.168.20.101' }],
          },
        ],
        wanUp: true,
        dnsForwarding: true,
      },
      {
        id: 'switch',
        kind: 'switch',
        name: 'switch',
        mac: '00:1A:2B:40:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 10, false, {
          'Fa0/1': { mode: 'trunk' },
          'Fa0/3': { vlan: 20 },
          'Fa0/4': { mode: 'trunk' },
        }),
      },
      {
        id: 'erisimNoktasi',
        kind: 'accessPoint',
        name: 'erisimNoktasi',
        mac: '00:1A:2B:40:00:03',
        position: { x: 780, y: 400 },
        powered: true,
        wirelessNetworks: [
          { ssid: 'Isletme', vlan: 10 },
          { ssid: 'Misafir', vlan: 20 },
        ],
      },
      {
        id: 'kasa',
        kind: 'pos',
        name: 'kasa',
        mac: '00:1A:2B:40:00:20',
        position: { x: 220, y: 520 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.10.20',
          mask,
          gateway: '192.168.10.1',
          dns: ['192.168.10.1'],
        },
        appLinks: [
          {
            id: 'mutfakEkrani',
            label: 'mutfakEkrani',
            targetIp: '192.168.10.30',
            targetKind: 'kitchenDisplay',
          },
        ],
      },
      {
        id: 'mutfakEkrani',
        kind: 'kitchenDisplay',
        name: 'mutfakEkrani',
        mac: '00:1A:2B:40:00:30',
        position: { x: 470, y: 520 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.10.30',
          mask,
          gateway: '192.168.10.1',
          dns: ['192.168.10.1'],
        },
      },
      {
        id: 'misafirTelefonu',
        kind: 'phone',
        name: 'misafirTelefonu',
        mac: '00:1A:2B:40:00:70',
        position: { x: 820, y: 540 },
        powered: true,
        host: {
          mode: 'dhcp',
          ip: '192.168.20.101',
          mask,
          gateway: '192.168.20.1',
          dns: ['192.168.20.1'],
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
        id: 'switchToErisimNoktasi',
        a: { deviceId: 'switch', portId: 'Fa0/4' },
        b: { deviceId: 'erisimNoktasi', portId: 'uplink' },
        connected: true,
      },
      {
        id: 'misafirTelefonuToErisimNoktasi',
        a: { deviceId: 'misafirTelefonu', portId: 'wlan0' },
        b: { deviceId: 'erisimNoktasi', portId: 'radio' },
        connected: true,
        ssid: 'Misafir',
      },
    ],
  },
  solvedWhen: [
    { type: 'appLinksOk', deviceId: 'kasa' },
    { type: 'internet', fromDeviceId: 'misafirTelefonu' },
  ],
}
