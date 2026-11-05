import type { Scenario } from '../domain/ScenarioTypes'
import { buildSwitchPorts } from './switchPorts'

const mask = '255.255.255.0'

export const cameraSubnet: Scenario = {
  id: 'cameraSubnet',
  order: 3,
  title: 'Kamera 3 görüntü vermiyor',
  setting: 'magaza',
  complaint: {
    from: 'Mağaza sorumlusu',
    message: 'Kayıt cihazında 3 numaralı kameradan görüntü yok.',
  },
  initialState: {
    devices: [
      {
        id: 'internet',
        kind: 'internet',
        name: 'İnternet',
        mac: '00:00:5E:00:03:01',
        position: { x: 500, y: 60 },
        powered: true,
      },
      {
        id: 'router',
        kind: 'router',
        name: 'Modem / Router',
        mac: '00:1A:2B:30:00:01',
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
            leases: [],
          },
        ],
        wanUp: true,
        dnsForwarding: true,
      },
      {
        id: 'switch',
        kind: 'switch',
        name: 'Switch (PoE)',
        mac: '00:1A:2B:30:00:02',
        position: { x: 500, y: 320 },
        powered: true,
        switchPorts: buildSwitchPorts(8, 1, true),
      },
      {
        id: 'nvr',
        kind: 'nvr',
        name: 'Kayıt Cihazı (NVR)',
        mac: '00:1A:2B:30:00:50',
        position: { x: 150, y: 500 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.1.50',
          mask,
          gateway: '192.168.1.1',
          dns: ['192.168.1.1'],
        },
        appLinks: [
          { id: 'kamera1', label: 'Kamera 1', targetIp: '192.168.1.61', targetKind: 'camera' },
          { id: 'kamera2', label: 'Kamera 2', targetIp: '192.168.1.62', targetKind: 'camera' },
          { id: 'kamera3', label: 'Kamera 3', targetIp: '192.168.1.63', targetKind: 'camera' },
        ],
      },
      {
        id: 'kamera1',
        kind: 'camera',
        name: 'Kamera 1',
        mac: '00:1A:2B:30:00:61',
        position: { x: 400, y: 500 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.1.61',
          mask,
          gateway: '192.168.1.1',
          dns: ['192.168.1.1'],
        },
      },
      {
        id: 'kamera2',
        kind: 'camera',
        name: 'Kamera 2',
        mac: '00:1A:2B:30:00:62',
        position: { x: 625, y: 500 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.1.62',
          mask,
          gateway: '192.168.1.1',
          dns: ['192.168.1.1'],
        },
      },
      {
        id: 'kamera3',
        kind: 'camera',
        name: 'Kamera 3',
        mac: '00:1A:2B:30:00:63',
        position: { x: 850, y: 500 },
        powered: true,
        host: {
          mode: 'static',
          ip: '192.168.0.64',
          mask,
          gateway: '192.168.0.1',
          dns: ['192.168.0.1'],
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
        id: 'nvrToSwitch',
        a: { deviceId: 'nvr', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/2' },
        connected: true,
      },
      {
        id: 'kamera1ToSwitch',
        a: { deviceId: 'kamera1', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/3' },
        connected: true,
      },
      {
        id: 'kamera2ToSwitch',
        a: { deviceId: 'kamera2', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/4' },
        connected: true,
      },
      {
        id: 'kamera3ToSwitch',
        a: { deviceId: 'kamera3', portId: 'eth0' },
        b: { deviceId: 'switch', portId: 'Fa0/5' },
        connected: true,
      },
    ],
  },
  solvedWhen: [{ type: 'appLinksOk', deviceId: 'nvr' }],
  hints: [
    'Kayıt cihazının terminalinden üç kameraya da ping at ve hangisinin cevap vermediğini bul.',
    'Kamera 3 açık ve kablosu takılı görünüyor; Kamera 3\'ün Ayarlar sekmesindeki IP adresini ve ağ geçidini diğer kameralarla karşılaştır.',
    'Kamera 3\'ün IP adresini 192.168.0.64 yerine 192.168.1.63, ağ geçidini 192.168.1.1 yap (maske 255.255.255.0 kalır).',
  ],
  explanation: {
    whatHappened:
      'Kamera 3 fabrika ayarlarına dönmüş ve üreticinin varsayılan adresi olan 192.168.0.64 ile açılmıştı. Kayıt cihazı ve diğer kameralar 192.168.1.x ağındaydı; kayıt cihazı kamerayı 192.168.1.63 adresinde aradığı için bulamadı. Kablo ve elektrik sağlamdı, sorun sadece adresin başka bir ağda olmasıydı.',
    realLife:
      'Elektrik kesintisi, uzun süre basılı kalan sıfırlama tuşu veya bir yazılım güncellemesinden sonra kameralar fabrika ayarlarına dönebilir ve varsayılan adresle açılır. Önlemek için her kameranın adresini ve MAC adresini bir listede tutmak, switch portlarını etiketlemek ve sıfırlanan kamerayı aynı adresle yeniden kurmak gerekir. Kurulumdan sonra kamera ayarlarını yedeklemek, sıfırlanan kamerayı yeniden kurmayı hızlandırır. Kameraları ayrı bir VLAN\'da toplamak ise arızayla ilgisi olmayan, ayrı bir güvenlik ve düzen önlemidir.',
    interviewAnswer:
      'Önce fiziksel kontrolü yaparım: kameranın PoE ışığı yanıyor mu, switch portu aktif mi, kablo sağlam mı. Kayıt cihazından sorunlu kameranın adresine ping atar, yanıt gelmediğini görünce kameranın kendi IP ayarlarına bakarım. Kameranın fabrika varsayılanı olan 192.168.0.64 adresiyle, yani başka bir ağda çalıştığını görünce IP adresini 192.168.1.63, ağ geçidini 192.168.1.1 olarak düzeltirim. Son olarak kayıt cihazından tekrar ping atar ve görüntünün geldiğini kontrol ederim.',
  },
  topics: ['Alt ağ', 'Statik IP', 'Fabrika ayarları', 'IP kamera'],
}
