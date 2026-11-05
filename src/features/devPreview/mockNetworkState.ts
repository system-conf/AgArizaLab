// TEMPORARY (wave 2): hard-coded network used only by DevPreview. Wave 3 removes it.
import type { NetworkState } from '../../domain/NetworkTypes'

const lanHost = { mask: '255.255.255.0', gateway: '192.168.1.1', dns: ['192.168.1.1'] }

export const mockNetworkState: NetworkState = {
  devices: [
    { id: 'internet', kind: 'internet', name: 'İnternet', mac: '00:00:00:00:00:00', position: { x: 500, y: 20 }, powered: true },
    {
      id: 'router',
      kind: 'router',
      name: 'Modem / Router',
      mac: 'AA:BB:CC:00:00:01',
      position: { x: 500, y: 150 },
      powered: true,
      wanUp: true,
      dnsForwarding: true,
      routerInterfaces: [{ id: 'LAN.1', vlan: 1, ip: '192.168.1.1', mask: '255.255.255.0' }],
      dhcpPools: [
        {
          id: 'pool1',
          vlan: 1,
          rangeStart: '192.168.1.100',
          rangeEnd: '192.168.1.200',
          mask: '255.255.255.0',
          gateway: '192.168.1.1',
          dns: ['192.168.1.1'],
          leases: [{ mac: 'AA:BB:CC:00:00:12', ip: '192.168.1.101' }],
        },
      ],
    },
    {
      id: 'switch',
      kind: 'switch',
      name: 'Switch',
      mac: 'AA:BB:CC:00:00:02',
      position: { x: 500, y: 320 },
      powered: true,
      switchPorts: [1, 2, 3, 4].map((n) => ({ id: `Fa0/${n}`, vlan: 1, mode: 'access' as const, enabled: true, poe: n === 4 })),
    },
    {
      id: 'muhasebe',
      kind: 'pc',
      name: 'PC Muhasebe',
      mac: 'AA:BB:CC:00:00:11',
      position: { x: 200, y: 520 },
      powered: true,
      host: { mode: 'static', ip: '192.168.1.20', ...lanHost },
      appLinks: [{ id: 'printer', label: 'Yazıcı', targetIp: '192.168.1.150', targetKind: 'printer' }],
    },
    {
      id: 'satis',
      kind: 'pc',
      name: 'PC Satış',
      mac: 'AA:BB:CC:00:00:12',
      position: { x: 450, y: 520 },
      powered: true,
      host: { mode: 'dhcp', ip: '192.168.1.101', ...lanHost },
    },
    {
      id: 'ap',
      kind: 'accessPoint',
      name: 'Kablosuz erişim noktası',
      mac: 'AA:BB:CC:00:00:03',
      position: { x: 750, y: 430 },
      powered: true,
      wirelessNetworks: [{ ssid: 'Ofis', vlan: 1 }],
    },
    {
      id: 'telefon',
      kind: 'phone',
      name: 'Telefon',
      mac: 'AA:BB:CC:00:00:21',
      position: { x: 900, y: 560 },
      powered: true,
      host: { mode: 'dhcp', ip: '', mask: '', gateway: '', dns: [] },
    },
  ],
  links: [
    { id: 'l1', a: { deviceId: 'internet', portId: 'wan' }, b: { deviceId: 'router', portId: 'wan' }, connected: true },
    { id: 'l2', a: { deviceId: 'router', portId: 'lan' }, b: { deviceId: 'switch', portId: 'Fa0/1' }, connected: true },
    { id: 'l3', a: { deviceId: 'switch', portId: 'Fa0/2' }, b: { deviceId: 'muhasebe', portId: 'eth0' }, connected: true },
    { id: 'l4', a: { deviceId: 'switch', portId: 'Fa0/3' }, b: { deviceId: 'satis', portId: 'eth0' }, connected: false },
    { id: 'l5', a: { deviceId: 'switch', portId: 'Fa0/4' }, b: { deviceId: 'ap', portId: 'uplink' }, connected: true },
    { id: 'l6', a: { deviceId: 'ap', portId: 'radio' }, b: { deviceId: 'telefon', portId: 'wlan0' }, connected: true, ssid: 'Ofis' },
  ],
}
