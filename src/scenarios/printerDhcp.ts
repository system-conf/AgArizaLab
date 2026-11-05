import type { Scenario } from '../domain/ScenarioTypes'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const printerDhcp: Scenario = {
  id: 'printerDhcp',
  order: 2,
  title: 'Yazıcı kayboldu',
  setting: 'ofis',
  complaint: {
    from: 'Ofis müdürü',
    message: 'Yazıcı dün çalışıyordu, bugün kimse çıktı alamıyor.',
  },
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'İnternet',
        mac: '00:00:5E:00:02:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'Modem / Router',
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
        name: 'Switch',
        mac: '00:1A:2B:20:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 1, false),
      },
      {
        id: 'muhasebe',
        kind: 'pc',
        name: 'PC Muhasebe',
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
          { id: 'yazici', label: 'Yazıcı', targetIp: '192.168.1.150', targetKind: 'printer' },
        ],
      },
      {
        id: 'satis',
        kind: 'pc',
        name: 'PC Satış',
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
          { id: 'yazici', label: 'Yazıcı', targetIp: '192.168.1.150', targetKind: 'printer' },
        ],
      },
      {
        id: 'yazici',
        kind: 'printer',
        name: 'Yazıcı',
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
  hints: [
    'Bilgisayarların yazıcı için kayıtlı adresine (Bilgi sekmesi) bak ve bu adrese ping at. Sonra yazıcının kendi adresini kontrol et.',
    'Yazıcıyı aç, ipconfig ile şu anki adresine bak: bilgisayarların beklediği 192.168.1.150 ile aynı mı? Yazıcı adresini DHCP ile otomatik alıyor.',
    'Yazıcının IP ayarını Statik yap: IP 192.168.1.150, maske 255.255.255.0, ağ geçidi 192.168.1.1, DNS 192.168.1.1. Böylece iki bilgisayar da yazıcıyı yeniden bulur.',
  ],
  explanation: {
    whatHappened:
      'Yazıcı adresini DHCP ile otomatik alıyordu. Kira süresi dolup yeniden adres istediğinde modem ona 192.168.1.150 yerine 192.168.1.153 verdi. Bilgisayarlar ise yazıcıyı hâlâ eski adres olan 192.168.1.150 üzerinden aradığı için çıktı gönderemedi.',
    realLife:
      'Yazıcı, kamera, kayıt cihazı gibi başka cihazların adresle bulduğu her cihazın adresi sabit olmalıdır. Kalıcı çözüm yazıcıya statik IP vermek ya da modemde yazıcının MAC adresine DHCP rezervasyonu yapmaktır; her bilgisayardaki yazıcı adresini tek tek değiştirmek değil, çünkü yazıcının adresi bir sonraki değişimde sorun tekrar eder. Statik adres verirken modemin otomatik dağıttığı aralığın dışında bir adres seçmek ya da o adresi dağıtım aralığından çıkarmak, iki cihazın aynı adresi almasını önler. Sabit adresleri bir listede belgelemek de işi kolaylaştırır.',
    interviewAnswer:
      'Önce fiziksel kontrolü yaparım: yazıcı açık mı, hata ışığı var mı, ağ kablosu takılı mı. Sonra bilgisayarların yazıcı için kullandığı adresi bulur, o adrese ping atarım; yanıt gelmediğini görünce yazıcının kendi ekranından veya ipconfig ile güncel adresine bakarım. Yazıcının DHCP ile yeni bir adres (192.168.1.153) aldığını görünce, kalıcı çözüm olarak yazıcıya bilgisayarların beklediği 192.168.1.150 adresini statik olarak veririm ya da modemde bu adres için DHCP rezervasyonu yaparım. Son olarak her bilgisayardan yazıcıya ping atar ve deneme çıktısı alarak sorunun çözüldüğünü doğrularım.',
  },
  topics: ['DHCP', 'Statik IP', 'DHCP rezervasyonu', 'Yazıcı'],
}
