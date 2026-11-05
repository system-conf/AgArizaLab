import type { Scenario } from '../domain/ScenarioTypes'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const wrongDns: Scenario = {
  id: 'wrongDns',
  order: 5,
  title: 'İnternet var, site açılmıyor',
  setting: 'ofis',
  complaint: {
    from: 'Muhasebe',
    message: 'İnternet var diyorlar ama bilgisayarımda hiçbir site açılmıyor.',
  },
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'İnternet',
        mac: '00:00:5E:00:05:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'Modem / Router',
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
        name: 'Switch',
        mac: '00:1A:2B:50:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 1, false),
      },
      {
        id: 'muhasebe',
        kind: 'pc',
        name: 'PC Muhasebe',
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
        name: 'PC Satış',
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
  hints: [
    'Muhasebe bilgisayarından önce 8.8.8.8 adresine, sonra google.com adına ping at. Biri çalışıp diğeri çalışmıyorsa nslookup google.com dene.',
    'Muhasebe bilgisayarında ipconfig /all ile DNS sunucusu adresine bak ve bu adrese ping at. Çalışan PC Satış\'ın DNS ayarıyla karşılaştır.',
    'Muhasebe bilgisayarının DNS sunucusunu 192.168.1.254 yerine 192.168.1.1 (modem) yap. 8.8.8.8 de çalışır.',
  ],
  explanation: {
    whatHappened:
      'Muhasebe bilgisayarının DNS sunucusu, artık ağda olmayan eski modemin adresi 192.168.1.254 olarak elle girilmişti. Bilgisayar internete çıkabiliyordu (8.8.8.8\'e ping gidiyordu) ama site adlarını IP adresine çeviremediği için hiçbir site açılmadı. DNS modem (192.168.1.1) olarak değiştirilince adlar yeniden çözüldü.',
    realLife:
      '"İnternet var ama site açılmıyor" şikâyetinin en sık nedeni DNS ayarıdır; özellikle modem değiştirildikten sonra statik ayarlı bilgisayarlar eski adreste kalır. Önlemek için bilgisayarları mümkünse DHCP\'de bırakmak, statik ayar gerekiyorsa hangi cihazda ne girildiğini belgelemek ve modem değişiminden önce bu listeyi gözden geçirmek gerekir. Hızlı ayrım için IP adresine ping (8.8.8.8) çalışıp ada ping (google.com) çalışmıyorsa sorunun DNS olduğu anlaşılır.',
    interviewAnswer:
      'Önce fiziksel kontrolü yaparım: kablo takılı mı, ağ simgesi bağlı görünüyor mu. Sonra ipconfig /all ile IP, maske, ağ geçidi ve DNS ayarlarına bakarım. Ağ geçidine ve 8.8.8.8 adresine ping atarak internet çıkışının çalıştığını doğrularım; google.com adına ping ve nslookup başarısız olunca sorunun DNS olduğunu anlarım. DNS sunucusunun 192.168.1.254 gibi artık olmayan bir adres olduğunu görür, modemin adresi 192.168.1.1 ile düzeltir ve nslookup ile tekrar doğrularım.',
  },
  topics: ['DNS', 'nslookup', 'Statik IP'],
}
