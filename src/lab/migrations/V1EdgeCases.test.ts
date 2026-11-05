// Migration of v1 shapes the exercises do not use but engine test fixtures may (MODEL_V2 §11).
import { describe, expect, it } from 'vitest'
import type { Device, DeviceKind, Link, NetworkState } from '../../domain/NetworkTypes'
import { StateInvariants, type DeviceV2, type NetworkStateV2 } from '../../domain/v2'
import { V1MigrationError } from './V1MigrationError'
import { migrateV1ToV2 } from './V1ToV2Migration'

let macCounter = 0
function device(id: string, kind: DeviceKind, extra: Partial<Device> = {}): Device {
  macCounter += 1
  const mac = `00:AA:00:00:00:${macCounter.toString(16).toUpperCase().padStart(2, '0')}`
  return { id, kind, name: id, mac, position: { x: 0, y: 0 }, powered: true, ...extra }
}

function host(id: string, kind: DeviceKind = 'pc'): Device {
  return device(id, kind, { host: { mode: 'static', ip: '192.168.1.20', mask: '255.255.255.0', gateway: '192.168.1.1', dns: [] } })
}

function router(extra: Partial<Device> = {}): Device {
  return device('router', 'router', {
    routerInterfaces: [{ id: 'LAN', vlan: 1, ip: '192.168.1.1', mask: '255.255.255.0' }],
    wanUp: true,
    dnsForwarding: true,
    ...extra,
  })
}

function link(id: string, a: [string, string], b: [string, string], ssid?: string): Link {
  const result: Link = { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true }
  return ssid === undefined ? result : { ...result, ssid }
}

function deviceOf(state: NetworkStateV2, id: string): DeviceV2 {
  const found = state.devices.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no device ${id}`)
  return found
}

function migrationError(state: NetworkState): V1MigrationError | undefined {
  try {
    migrateV1ToV2(state)
  } catch (error) {
    if (error instanceof V1MigrationError) return error
    throw error
  }
  return undefined
}

describe('v1 → v2 migration edge cases', () => {
  it('cables a host directly on the router LAN with a crossover cable', () => {
    const state = migrateV1ToV2({ devices: [router(), host('pc')], links: [link('direct', ['router', 'lan'], ['pc', 'eth0'])] })
    expect(state.links[0]).toMatchObject({ a: { portId: 'Gi0/0' }, b: { portId: 'eth0' }, cable: 'copperCross' })
    expect(new StateInvariants().violations(state)).toEqual([])
  })

  it('turns a WAN that was down into a cloud handoff without service', () => {
    const state = migrateV1ToV2({
      devices: [device('internet', 'internet'), router({ wanUp: false })],
      links: [link('wan', ['internet', 'wan'], ['router', 'wan'])],
    })
    expect(deviceOf(state, 'internet').internet).toEqual({ handoffs: [{ portId: 'eth0', serviceUp: false }] })
    expect(deviceOf(state, 'internet').ports.map((port) => port.id)).toEqual(['eth0', 'eth1', 'eth2', 'eth3'])
  })

  it('creates a v1 port that did not exist as administratively down (v1 treated it as dead)', () => {
    const switchDevice = device('switch', 'switch', {
      switchPorts: [{ id: 'Fa0/1', vlan: 1, mode: 'access', enabled: true, poe: false }],
    })
    const state = migrateV1ToV2({ devices: [switchDevice, host('pc')], links: [link('ghost', ['pc', 'eth0'], ['switch', 'Fa0/9'])] })
    expect(deviceOf(state, 'switch').ports.find((port) => port.id === 'Fa0/9')).toMatchObject({ role: 'switched', adminUp: false })
    expect(deviceOf(state, 'switch').ports.map((port) => port.id)).toEqual(['Fa0/1', 'Console', 'Fa0/9'])
  })

  it('gives a laptop-style host both NICs when v1 linked its wlan0, keeping the address on the linked one', () => {
    const ap = device('ap', 'accessPoint', { wirelessNetworks: [{ ssid: 'Office', vlan: 1 }] })
    const state = migrateV1ToV2({ devices: [ap, host('pc')], links: [link('air', ['pc', 'wlan0'], ['ap', 'radio'], 'Office')] })
    const pc = deviceOf(state, 'pc')
    expect(pc.ports.map((port) => [port.id, port.medium])).toEqual([
      ['eth0', 'copper'],
      ['wlan0', 'wireless'],
    ])
    expect(pc.ports[1]).toMatchObject({ mac: pc.baseMac, l3: { ipv4: { address: '192.168.1.20' } } })
    expect(pc.ports[0]).toMatchObject({ l3: { ipv4: { addressing: 'dhcp', address: '' } } })
    expect(new StateInvariants().violations(state)).toEqual([])
  })

  it('numbers a second interface of one VLAN away from the first', () => {
    const state = migrateV1ToV2({
      devices: [
        router({
          routerInterfaces: [
            { id: 'A', vlan: 10, ip: '10.0.10.1', mask: '255.255.255.0' },
            { id: 'B', vlan: 10, ip: '10.0.11.1', mask: '255.255.255.0' },
          ],
        }),
      ],
      links: [],
    })
    const lan = deviceOf(state, 'router').ports[0]
    expect(lan?.role === 'routed' ? lan.subInterfaces.map((sub) => sub.id) : []).toEqual(['Gi0/0.10', 'Gi0/0.1010'])
  })

  it('refuses links to unknown devices, shared ports and settings without a v2 place', () => {
    expect(migrationError({ devices: [host('pc')], links: [link('x', ['pc', 'eth0'], ['ghost', 'eth0'])] })?.code).toBe('unknownDevice')
    const shared = { devices: [router(), host('a'), host('b')], links: [link('x', ['router', 'lan'], ['a', 'eth0']), link('y', ['router', 'lan'], ['b', 'eth0'])] }
    expect(migrationError(shared)?.code).toBe('portShared')
    const misplaced = device('switch', 'switch', { appLinks: [{ id: 'x', label: 'x', targetIp: '1.1.1.1', targetKind: 'pc' }] })
    expect(migrationError({ devices: [misplaced], links: [] })?.code).toBe('unsupportedSetting')
  })
})
