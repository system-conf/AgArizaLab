// Field-level spot checks per exercise: the fault of each exercise must survive the migration.
import { describe, expect, it } from 'vitest'
import type { DeviceV2, NetworkStateV2, Port } from '../../domain/v2'
import { cameraSubnet } from '../../scenarios/cameraSubnet'
import { kitchenVlan } from '../../scenarios/kitchenVlan'
import { posGateway } from '../../scenarios/posGateway'
import { printerDhcp } from '../../scenarios/printerDhcp'
import { wrongDns } from '../../scenarios/wrongDns'
import { migrateV1Exercise, migrateV1ToV2 } from './V1ToV2Migration'

function deviceOf(state: NetworkStateV2, id: string): DeviceV2 {
  const device = state.devices.find((candidate) => candidate.id === id)
  if (!device) throw new Error(`no device ${id}`)
  return device
}

function portOf(state: NetworkStateV2, deviceId: string, portId: string): Port {
  const port = deviceOf(state, deviceId).ports.find((candidate) => candidate.id === portId)
  if (!port) throw new Error(`no port ${deviceId}:${portId}`)
  return port
}

describe('posGateway after migration', () => {
  const state = migrateV1ToV2(posGateway.initialState)

  it('keeps the wrong gateway and public DNS of the POS', () => {
    expect(portOf(state, 'kasa', 'eth0')).toMatchObject({ l3: { ipv4: { addressing: 'static', address: '192.168.10.20' } } })
    expect(deviceOf(state, 'kasa').host).toMatchObject({ defaultGateway: '192.168.1.1', dnsServers: ['8.8.8.8'] })
  })

  it('builds the router as LAN Gi0/0 + WAN Gi0/1 + Console, cabled straight-through', () => {
    expect(deviceOf(state, 'router').ports.map((port) => port.id)).toEqual(['Gi0/0', 'Gi0/1', 'Console'])
    expect(portOf(state, 'router', 'Gi0/0')).toMatchObject({ l3: { ipv4: { address: '192.168.10.1' } }, subInterfaces: [] })
    expect(portOf(state, 'router', 'Gi0/1')).toMatchObject({ l3: { ipv4: { addressing: 'dhcp', address: '' } } })
    expect(state.links.map((link) => link.cable)).toEqual(Array(5).fill('copperStraight'))
    expect(state.links[0]).toMatchObject({ a: { deviceId: 'internet', portId: 'eth0' }, b: { deviceId: 'router', portId: 'Gi0/1' } })
  })

  it('maps the setting id to English', () => {
    expect(migrateV1Exercise(posGateway).setting).toBe('restaurant')
  })
})

describe('printerDhcp after migration', () => {
  const state = migrateV1ToV2(printerDhcp.initialState)

  it('keeps the printer on its new DHCP address with the lease for its MAC', () => {
    expect(portOf(state, 'yazici', 'eth0')).toMatchObject({
      mac: '00:1A:2B:20:00:30',
      l3: { ipv4: { addressing: 'dhcp', address: '192.168.1.153' } },
    })
    expect(deviceOf(state, 'router').services?.dhcp?.pools[0]?.leases).toContainEqual({ mac: '00:1A:2B:20:00:30', ip: '192.168.1.153' })
  })

  it('keeps both app links to the old printer address', () => {
    for (const pc of ['muhasebe', 'satis']) {
      expect(deviceOf(state, pc).host?.appLinks).toEqual([
        { id: 'yazici', label: 'yazici', targetIp: '192.168.1.150', targetKind: 'printer' },
      ])
    }
  })
})

describe('cameraSubnet after migration', () => {
  const state = migrateV1ToV2(cameraSubnet.initialState)

  it('picks the PoE switch model and keeps PoE on every port', () => {
    const switchDevice = deviceOf(state, 'switch')
    expect(switchDevice.modelId).toBe('switch8Poe')
    expect(switchDevice.ports.filter((port) => port.medium === 'copper').every((port) => port.poe === 'auto')).toBe(true)
  })

  it('keeps camera 3 on the factory subnet', () => {
    expect(portOf(state, 'kamera3', 'eth0')).toMatchObject({ l3: { ipv4: { address: '192.168.0.64', mask: '255.255.255.0' } } })
    expect(deviceOf(state, 'kamera3').host?.defaultGateway).toBe('192.168.0.1')
    expect(deviceOf(state, 'kamera3').kind).toBe('camera')
    expect(deviceOf(state, 'kamera3').modelId).toBe('ipCamera')
  })
})

describe('kitchenVlan after migration', () => {
  const state = migrateV1ToV2(kitchenVlan.initialState)

  it('keeps the kitchen display port in the wrong VLAN and the trunks', () => {
    expect(portOf(state, 'switch', 'Fa0/3')).toMatchObject({ l2: { mode: 'access', accessVlan: 20 } })
    expect(portOf(state, 'switch', 'Fa0/1')).toMatchObject({ l2: { mode: 'trunk', nativeVlan: 1, allowedVlans: 'all' } })
    expect(portOf(state, 'switch', 'Fa0/4')).toMatchObject({ l2: { mode: 'trunk' } })
    expect(deviceOf(state, 'switch').switching?.vlans).toEqual([
      { id: 1, name: 'default' },
      { id: 10, name: 'VLAN0010' },
      { id: 20, name: 'VLAN0020' },
    ])
  })

  it('turns the VLAN interfaces into dot1Q sub-interfaces (no native address)', () => {
    const lan = portOf(state, 'router', 'Gi0/0')
    expect(lan).toMatchObject({ l3: { ipv4: { address: '' } } })
    expect(lan.role === 'routed' ? lan.subInterfaces : []).toEqual([
      { id: 'Gi0/0.10', vlan: 10, adminUp: true, description: 'LAN.10', l3: { ipv4: { addressing: 'static', address: '192.168.10.1', mask: '255.255.255.0' } } },
      { id: 'Gi0/0.20', vlan: 20, adminUp: true, description: 'LAN.20', l3: { ipv4: { addressing: 'static', address: '192.168.20.1', mask: '255.255.255.0' } } },
    ])
  })

  it('associates the guest phone over Wi-Fi on the guest SSID', () => {
    const phone = deviceOf(state, 'misafirTelefonu')
    expect(phone.kind).toBe('smartphone')
    expect(phone.ports.map((port) => [port.id, port.medium])).toEqual([['wlan0', 'wireless']])
    expect(state.links.find((link) => link.id === 'misafirTelefonuToErisimNoktasi')).toEqual({
      id: 'misafirTelefonuToErisimNoktasi',
      a: { deviceId: 'misafirTelefonu', portId: 'wlan0' },
      b: { deviceId: 'erisimNoktasi', portId: 'Radio0' },
      connected: true,
      cable: 'wireless',
      ssid: 'Misafir',
    })
    expect(portOf(state, 'erisimNoktasi', 'Gi0')).toMatchObject({ role: 'switched', l2: { mode: 'trunk' } })
  })
})

describe('wrongDns after migration', () => {
  it('keeps the stale DNS server of the accounting PC', () => {
    const state = migrateV1ToV2(wrongDns.initialState)
    expect(deviceOf(state, 'muhasebe').host?.dnsServers).toEqual(['192.168.1.254'])
    expect(deviceOf(state, 'satis').host?.dnsServers).toEqual(['192.168.1.1'])
  })
})
