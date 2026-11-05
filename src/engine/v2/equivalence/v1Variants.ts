// Test-only: every v1 state the v1 engine tests build (fixtures + the edits the tests apply), so the
// v2 engine can be compared against v1 on migrateV1ToV2 of each of them.
import type { NetworkState } from '../../../domain/NetworkTypes'
import {
  makeHost,
  makeInternet,
  makeLink,
  makeRouter,
  officeNetwork,
  updateDevice,
  updateHost,
  updateLink,
  updatePort,
  vlanNetwork,
} from '../../testFixtures'

export interface V1Variant {
  name: string
  state: NetworkState
}

function withNewDhcpHost(state: NetworkState, portId: string): NetworkState {
  return {
    devices: [...state.devices, makeHost('laptop', 'pc', { mode: 'dhcp' })],
    links: [...state.links, makeLink('laptopLink', ['laptop', 'eth0'], ['switch', portId])],
  }
}

function withExtraPort(state: NetworkState, portId: string, vlan: number): NetworkState {
  return updateDevice(state, 'switch', (device) => ({
    ...device,
    switchPorts: [...(device.switchPorts ?? []), { id: portId, vlan, mode: 'access', enabled: true, poe: false }],
  }))
}

function powerOff(state: NetworkState, id: string): NetworkState {
  return updateDevice(state, id, (device) => ({ ...device, powered: false }))
}

/**
 * The SegmentFinder test's host plugged straight into the router. MODEL_V2 §11 difference 1: v1
 * `wanUp: true` without a cloud link still reached the internet; v2 needs the cloud, so the fixture
 * gets one (MODEL_V2 §15 decision 6: fix fixtures, never bend the model).
 */
function directRouterNetwork(): NetworkState {
  return {
    devices: [
      makeInternet(),
      makeRouter('router', [{ id: 'LAN', vlan: 1, ip: '192.168.1.1', mask: '255.255.255.0' }]),
      makeHost('pc', 'pc', { ip: '192.168.1.5', gateway: '192.168.1.1', dns: ['192.168.1.1'] }),
    ],
    links: [makeLink('wan', ['internet', 'wan'], ['router', 'wan']), makeLink('direct', ['pc', 'eth0'], ['router', 'lan'])],
  }
}

function officeVariants(): V1Variant[] {
  const office = officeNetwork
  const conflict = (): NetworkState => updateHost(office(), 'printer', { ip: '192.168.1.20' })
  const laptop = (vlan: number): NetworkState => withNewDhcpHost(withExtraPort(office(), 'Fa0/5', vlan), 'Fa0/5')
  return [
    { name: 'office', state: office() },
    { name: 'office pc1 off', state: powerOff(office(), 'pc1') },
    { name: 'office pc1 unplugged', state: updateLink(office(), 'pc1Link', { connected: false }) },
    { name: 'office Fa0/2 shut', state: updatePort(office(), 'switch', 'Fa0/2', { enabled: false }) },
    { name: 'office pc1 no ip', state: updateHost(office(), 'pc1', { ip: '' }) },
    { name: 'office pc1 bad ip', state: updateHost(office(), 'pc1', { ip: '192.168.1.300' }) },
    { name: 'office pc1 bad mask', state: updateHost(office(), 'pc1', { mask: '255.0.255.0' }) },
    { name: 'office printer off', state: powerOff(office(), 'printer') },
    { name: 'office pc1 no gateway', state: updateHost(office(), 'pc1', { gateway: '' }) },
    { name: 'office pc1 gateway outside', state: updateHost(office(), 'pc1', { gateway: '192.168.0.1' }) },
    { name: 'office pc1 gateway 10.0.0.1', state: updateHost(office(), 'pc1', { gateway: '10.0.0.1' }) },
    { name: 'office pc1 gateway nobody', state: updateHost(office(), 'pc1', { gateway: '192.168.1.254' }) },
    { name: 'office wan down', state: updateDevice(office(), 'router', (router) => ({ ...router, wanUp: false })) },
    { name: 'office no dns forwarding', state: updateDevice(office(), 'router', (router) => ({ ...router, dnsForwarding: false })) },
    { name: 'office no pools', state: updateDevice(office(), 'router', (router) => ({ ...router, dhcpPools: [] })) },
    { name: 'office conflict', state: conflict() },
    { name: 'office conflict printer off', state: powerOff(conflict(), 'printer') },
    { name: 'office pc1 takes router ip', state: updateHost(office(), 'pc1', { ip: '192.168.1.1' }) },
    { name: 'office pc1 network address', state: updateHost(office(), 'pc1', { ip: '192.168.1.0' }) },
    { name: 'office pc1 broadcast', state: updateHost(office(), 'pc1', { ip: '192.168.1.255' }) },
    { name: 'office pc1 wider mask', state: updateHost(office(), 'pc1', { ip: '192.168.1.0', mask: '255.255.254.0' }) },
    { name: 'office printer broadcast', state: updateHost(office(), 'printer', { ip: '192.168.1.255' }) },
    { name: 'office pc1 no dns', state: updateHost(office(), 'pc1', { dns: [] }) },
    { name: 'office pc1 dns printer', state: updateHost(office(), 'pc1', { dns: ['192.168.1.150'] }) },
    { name: 'office pc1 dns nobody', state: updateHost(office(), 'pc1', { dns: ['192.168.1.254'] }) },
    { name: 'office pc1 dns fallback', state: updateHost(office(), 'pc1', { dns: ['192.168.1.254', '1.1.1.1'] }) },
    { name: 'office pc1 dns not resolver', state: updateHost(office(), 'pc1', { dns: ['4.4.4.4'] }) },
    { name: 'office pc1 two dns', state: updateHost(office(), 'pc1', { dns: ['8.8.8.8', '1.1.1.1'] }) },
    { name: 'office pc2 no lease', state: updateHost(office(), 'pc2', { ip: '', gateway: '' }) },
    { name: 'office pc2 released', state: updateHost(office(), 'pc2', { ip: '', gateway: '', dns: [] }) },
    { name: 'office pc2 unplugged', state: updateLink(office(), 'pc2Link', { connected: false }) },
    { name: 'office Fa0/3 shut', state: updatePort(office(), 'switch', 'Fa0/3', { enabled: false }) },
    { name: 'office printer is camera', state: updateDevice(office(), 'printer', (device) => ({ ...device, kind: 'camera' })) },
    { name: 'office printer is nvr', state: updateDevice(office(), 'printer', (device) => ({ ...device, kind: 'nvr' })) },
    { name: 'office laptop', state: laptop(1) },
    {
      name: 'office laptop static at .100',
      state: updateDevice(laptop(1), 'printer', (device) => (device.host ? { ...device, host: { ...device.host, ip: '192.168.1.100' } } : device)),
    },
    {
      name: 'office laptop pool full',
      state: updateDevice(laptop(1), 'router', (router) => ({
        ...router,
        dhcpPools: (router.dhcpPools ?? []).map((pool) => ({ ...pool, rangeStart: '192.168.1.101', rangeEnd: '192.168.1.101' })),
      })),
    },
    { name: 'office laptop vlan 30', state: laptop(30) },
    { name: 'office printer moved', state: updateHost(updateHost(office(), 'pc2', { ip: '192.168.1.150' }), 'printer', { ip: '192.168.1.153' }) },
    { name: 'office printer at .153', state: updateHost(office(), 'printer', { ip: '192.168.1.153' }) },
    {
      name: 'office internet applink',
      state: updateDevice(office(), 'pc1', (device) => ({
        ...device,
        appLinks: [{ id: 'cloud', label: 'Bulut yedek', targetIp: '203.0.113.30', targetKind: 'internet' }],
      })),
    },
    { name: 'office pc2 conflict', state: updateHost(office(), 'pc2', { ip: '192.168.1.20' }) },
    { name: 'office printer no ip', state: updateHost(office(), 'printer', { ip: '' }) },
    { name: 'office broken dns and printer', state: updateHost(updateHost(office(), 'pc1', { dns: ['192.168.1.254'] }), 'printer', { ip: '192.168.1.153' }) },
    { name: 'office unknown switch port', state: updateLink(office(), 'pc1Link', { b: { deviceId: 'switch', portId: 'Fa0/9' } }) },
    { name: 'office switch off', state: powerOff(office(), 'switch') },
    { name: 'office router off', state: powerOff(office(), 'router') },
  ]
}

function vlanVariants(): V1Variant[] {
  const vlans = vlanNetwork
  return [
    { name: 'vlans', state: vlans() },
    { name: 'vlans kitchen in vlan 20', state: updatePort(vlans(), 'switch', 'Fa0/3', { vlan: 20 }) },
    { name: 'vlans kasa in vlan 20', state: updatePort(vlans(), 'switch', 'Fa0/2', { vlan: 20 }) },
    {
      name: 'vlans router without vlan 20',
      state: updateDevice(vlans(), 'router', (router) => ({
        ...router,
        routerInterfaces: (router.routerInterfaces ?? []).filter((item) => item.vlan !== 20),
      })),
    },
    { name: 'vlans guestPc no gateway', state: updateHost(vlans(), 'guestPc', { gateway: '' }) },
    { name: 'vlans guestPc wrong vlan gateway', state: updateHost(vlans(), 'guestPc', { mask: '255.255.0.0', gateway: '192.168.10.1' }) },
    { name: 'vlans guestPc same ip other vlan', state: updateHost(vlans(), 'guestPc', { ip: '192.168.10.20' }) },
    { name: 'vlans kasa takes vlan 20 router ip', state: updateHost(vlans(), 'kasa', { ip: '192.168.20.1' }) },
    { name: 'vlans kasa takes vlan 10 router ip', state: updateHost(vlans(), 'kasa', { ip: '192.168.10.1' }) },
    { name: 'vlans unknown ssid', state: updateLink(vlans(), 'phoneLink', { ssid: 'Yok' }) },
    { name: 'vlans phone is pc', state: updateDevice(vlans(), 'phone', (device) => ({ ...device, kind: 'pc' })) },
    { name: 'vlans laptop vlan 10', state: withNewDhcpHost(withExtraPort(vlans(), 'Fa0/6', 10), 'Fa0/6') },
    { name: 'vlans ap off', state: powerOff(vlans(), 'ap') },
  ]
}

export function v1EngineVariants(): V1Variant[] {
  return [...officeVariants(), ...vlanVariants(), { name: 'direct router (cloud added)', state: directRouterNetwork() }]
}
