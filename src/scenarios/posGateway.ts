import type { Scenario } from '../domain/ScenarioTypes'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const posGateway: Scenario = {
  id: 'posGateway',
  order: 1,
  title: 'Kasa internete çıkmıyor',
  setting: 'restoran',
  complaint: {
    from: 'Şube müdürü',
    message: 'Yeni şubede kasa internete çıkmıyor, kartla ödeme alamıyoruz.',
  },
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'İnternet',
        mac: '00:00:5E:00:01:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'Modem / Router',
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
        name: 'Switch',
        mac: '00:1A:2B:10:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 1, false),
      },
      {
        id: 'kasa',
        kind: 'pos',
        name: 'Kasa (POS)',
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
        name: 'Mutfak Ekranı',
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
        name: 'Müdür PC',
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
  hints: [
    'Kasanın terminalinde önce ipconfig ile IP ayarlarına bak, sonra ağ geçidine ping at.',
    'Kasanın Ayarlar sekmesindeki "Ağ geçidi" adresini modemin LAN adresiyle (192.168.10.1) karşılaştır.',
    'Kasanın ağ geçidini 192.168.1.1 yerine 192.168.10.1 yap. IP 192.168.10.20, maske 255.255.255.0 kalabilir.',
  ],
  explanation: {
    whatHappened:
      'Kasaya elle (statik) girilen ağ geçidi 192.168.1.1, eski şubenin modem adresiydi. Kasa 192.168.10.x ağında olduğu için bu adres kendi ağının dışında kaldı; kasa internete giden kapıyı bulamadı. Aynı ağdaki DHCP ile adres alan cihazlar doğru ağ geçidini (192.168.10.1) otomatik aldığı için onlarda sorun yoktu.',
    realLife:
      'Bir şubeden sökülüp başka şubeye taşınan kasa, yazıcı veya PC eski statik ayarlarıyla gelirse bu durum çok sık yaşanır: cihaz yerel ağda görünür ama internete ve ödeme sistemine çıkamaz. Önlemek için cihazı taşımadan önce IP ayarlarını sıfırlamak, mümkünse DHCP kullanmak (sabit adres gerekiyorsa modemde DHCP rezervasyonu yapmak) ve her şubenin IP planını (ağ adresi, ağ geçidi, DNS) bir belgede tutmak gerekir.',
    interviewAnswer:
      'Önce fiziksel katmana bakarım: kasa açık mı, kablo takılı mı, switch portunun ışığı yanıyor mu. Sonra ipconfig ile IP, maske ve ağ geçidini kontrol ederim; burada kasa 192.168.10.20 iken ağ geçidinin 192.168.1.1 olduğunu, yani başka bir ağda kaldığını görürüm. Ağ geçidine ping atarak bunu doğrular, ağ geçidini modemin LAN adresi 192.168.10.1 olarak düzeltirim. Ardından 8.8.8.8 adresine ping ile internete çıkışı, son olarak nslookup ile ödeme sunucusunun adının çözüldüğünü kontrol ederim.',
  },
  topics: ['Ağ geçidi', 'Statik IP', 'Alt ağ'],
}
