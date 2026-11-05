import type { Scenario } from '../domain/ScenarioTypes'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const kitchenVlan: Scenario = {
  id: 'kitchenVlan',
  order: 4,
  title: 'Siparişler mutfağa düşmüyor',
  setting: 'restoran',
  complaint: {
    from: 'Mutfak şefi',
    message: 'Kasadan girilen siparişler mutfak ekranına düşmüyor.',
  },
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'İnternet',
        mac: '00:00:5E:00:04:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'Modem / Router',
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
        name: 'Switch',
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
        name: 'Kablosuz Erişim Noktası',
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
        name: 'Kasa (POS)',
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
            label: 'Mutfak ekranı',
            targetIp: '192.168.10.30',
            targetKind: 'kitchenDisplay',
          },
        ],
      },
      {
        id: 'mutfakEkrani',
        kind: 'kitchenDisplay',
        name: 'Mutfak Ekranı',
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
        name: 'Misafir Telefonu',
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
  hints: [
    'Kasadan mutfak ekranının adresine (192.168.10.30) ping at. IP ayarları doğru görünüyorsa sorunu kablonun takılı olduğu switch portunda ara.',
    'Switch\'in port ayarlarına bak: Kasa Fa0/2\'ye, Mutfak Ekranı Fa0/3\'e bağlı. İki portun VLAN numaraları aynı mı?',
    'Switch\'te Fa0/3 portunu access modunda VLAN 10 yap. Misafir ağındaki telefonun VLAN 20\'de kalması doğrudur, ona dokunma.',
  ],
  explanation: {
    whatHappened:
      'Mutfak ekranının takılı olduğu switch portu Fa0/3, işletme ağı olan VLAN 10 yerine misafir ağı VLAN 20\'ye ayarlanmıştı. Ekranın IP ayarları doğru olsa da switch onu misafir ağına koyduğu için kasa, aynı ağda olduğunu sandığı ekranı bulamadı. Port VLAN 10 yapılınca ikisi aynı ağa döndü.',
    realLife:
      'Misafir Wi-Fi\'si ayrı VLAN\'da tutulan işletmelerde, birisi kabloyu başka bir porta taktığında ya da port ayarı yanlışlıkla değiştirildiğinde bu sorun sık görülür. Önlemek için switch portlarını ve duvar prizlerini hangi VLAN\'a ait olduklarıyla etiketlemek, port-VLAN tablosunu belgelemek ve switch ayarlarının yedeğini almak gerekir. Misafir ağını ayrı bir VLAN\'a almak iki ağı birbirinden ayırır; hata ayrımın kendisinde değil, portun yanlış VLAN\'a atanmasındadır. Ancak VLAN tek başına yetmez: misafirlerin işletme cihazlarına hiç ulaşamaması için router\'da ayrıca bir erişim kuralı (ACL ya da güvenlik duvarı kuralı) tanımlamak gerekir.',
    interviewAnswer:
      'Önce fiziksel kontrolü yaparım: mutfak ekranı açık mı, kablosu takılı mı, switch portunun ışığı yanıyor mu. Sonra iki cihazın ağ ayarlarına (kasada ipconfig, ekranda kendi ayar menüsü) bakıp IP, maske ve ağ geçidinin aynı ağda ve doğru olduğunu doğrularım. Ayarlar doğru olduğu halde kasadan ekrana ping gitmiyorsa, iki cihazın switch\'te aynı VLAN\'da olup olmadığına bakarım; burada ekranın bağlı olduğu Fa0/3 portunun VLAN 20\'de olduğunu görür ve VLAN 10 yaparım. Son olarak kasadan ekrana tekrar ping atar, bir deneme siparişiyle sorunun çözüldüğünü ve misafir ağının hâlâ internete çıktığını kontrol ederim.',
  },
  topics: ['VLAN', 'Switch portu', 'Misafir ağı'],
}
