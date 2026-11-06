import { describe, expect, it } from 'vitest'
import { CableRules, MacAddress, StateInvariants, type Device, type NetworkState, type Port } from '../domain'
import { SeededBaseMacSource } from './BaseMacSource'
import { HOME_ROUTER_LAN } from './DeviceDefaults'
import { deviceCatalog, findDeviceModel } from './DeviceCatalog'
import { PortFactory } from './PortFactory'

const invariants = new StateInvariants()

function modelOf(id: string) {
  const model = findDeviceModel(id)
  if (model === undefined) throw new Error(`no model ${id}`)
  return model
}

function portOf(device: Device, id: string): Port {
  const port = device.ports.find((candidate) => candidate.id === id)
  if (port === undefined) throw new Error(`no port ${id}`)
  return port
}

function seededFactory(seed = 7): PortFactory {
  return new PortFactory(new SeededBaseMacSource(seed))
}

describe('PortFactory', () => {
  describe.each(deviceCatalog.map((model) => [model.id, model] as const))('%s', (_, model) => {
    const device = seededFactory().createDevice(model, 'device1', 'Device 1')

    it('passes StateInvariants alone in a lab', () => {
      expect(invariants.violations({ devices: [device], links: [] })).toEqual([])
    })

    it('creates every template port in order with the model identity', () => {
      expect(device.ports.map((port) => [port.id, port.medium, port.role])).toEqual(
        model.ports.map((port) => [port.id, port.medium, port.role]),
      )
      expect(device).toMatchObject({ id: 'device1', name: 'Device 1', kind: model.kind, modelId: model.id, powered: true })
    })

    it('gives a MAC to exactly the Ethernet / Wi-Fi ports', () => {
      for (const port of device.ports) {
        expect(port.mac !== undefined, port.id).toBe(port.medium !== 'serial' && port.medium !== 'console')
      }
    })
  })

  it('creates the same device for the same seed and different MACs for another seed', () => {
    const model = modelOf('switch24')
    const first = seededFactory(1).createDevice(model, 'sw', 'sw')
    expect(seededFactory(1).createDevice(model, 'sw', 'sw')).toEqual(first)
    expect(seededFactory(2).createDevice(model, 'sw', 'sw').baseMac).not.toBe(first.baseMac)
  })

  it('uses a base MAC passed in, normalized', () => {
    const device = PortFactory.createDevice(modelOf('pc'), 'pc1', 'PC 1', { baseMac: '00:a0:12:34:56:78' })
    expect(device.baseMac).toBe('00:A0:12:34:56:78')
    expect(portOf(device, 'eth0').mac).toBe('00:A0:12:34:56:78')
  })

  it('creates random, valid base MACs by default', () => {
    const first = PortFactory.createDevice(modelOf('pc'), 'pc1', 'PC 1')
    const second = PortFactory.createDevice(modelOf('pc'), 'pc2', 'PC 2')
    expect(MacAddress.isValid(first.baseMac)).toBe(true)
    expect(first.baseMac).not.toBe(second.baseMac)
  })

  it('keeps MACs unique across a lab with one device of every model', () => {
    const factory = seededFactory(42)
    const state: NetworkState = {
      devices: deviceCatalog.map((model, index) => factory.createDevice(model, `device${index}`, model.id)),
      links: [],
    }
    expect(invariants.violations(state)).toEqual([])
  })

  it('uses the base MAC on the primary port of routers and hosts, derives every switch port', () => {
    const factory = seededFactory()
    const router = factory.createDevice(modelOf('router2Port'), 'r', 'r')
    expect(portOf(router, 'Gi0/0').mac).toBe(router.baseMac)
    expect(portOf(router, 'Gi0/1').mac).toBe(MacAddress.derive(router.baseMac, 2))
    const laptop = factory.createDevice(modelOf('laptop'), 'l', 'l')
    expect(portOf(laptop, 'eth0').mac).toBe(laptop.baseMac)
    const sw = factory.createDevice(modelOf('switch8'), 'sw', 'sw')
    expect(sw.ports.some((port) => port.mac === sw.baseMac)).toBe(false)
    expect(portOf(sw, 'Fa0/1').mac).toBe(MacAddress.derive(sw.baseMac, 1))
  })

  it('shuts router interfaces and leaves switch ports up in access VLAN 1', () => {
    const factory = seededFactory()
    const router = factory.createDevice(modelOf('router2PortSerial'), 'r', 'r')
    for (const port of router.ports) expect(port.adminUp, port.id).toBe(port.role === 'console')
    expect(portOf(router, 'Gi0/0')).toMatchObject({ l3: { ipv4: { addressing: 'static', address: '', mask: '' } }, subInterfaces: [] })
    expect(router.routing).toEqual({ ipRouting: true, staticRoutes: [] })

    const sw = factory.createDevice(modelOf('switch24Poe'), 'sw', 'sw')
    expect(portOf(sw, 'Fa0/1')).toMatchObject({
      adminUp: true,
      poe: 'auto',
      l2: { mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' },
    })
    expect(portOf(sw, 'Gi0/1').poe).toBeUndefined()
    expect(sw.switching?.vlans).toEqual([{ id: 1, name: 'default' }])
    expect(sw.routing).toBeUndefined()
  })

  it('gives L3 switches a VLAN database and routing switched off', () => {
    const device = seededFactory().createDevice(modelOf('l3Switch24'), 'core', 'core')
    expect(device.switching?.svis).toEqual([{ vlan: 1, adminUp: false, l3: { ipv4: { addressing: 'static', address: '', mask: '' } } }])
    expect(device.routing).toEqual({ ipRouting: false, staticRoutes: [] })
  })

  it('makes host NICs DHCP clients with empty host settings', () => {
    const device = seededFactory().createDevice(modelOf('laptop'), 'l', 'l')
    for (const port of device.ports) {
      expect(port).toMatchObject({ role: 'host', adminUp: true, l3: { ipv4: { addressing: 'dhcp', address: '', mask: '' } } })
    }
    expect(device.host).toEqual({ defaultGateway: '', dnsServers: [], appLinks: [] })
  })

  it('makes the access point uplink a trunk and offers the default SSID', () => {
    const ap = seededFactory().createDevice(modelOf('accessPoint'), 'ap', 'ap')
    expect(portOf(ap, 'Gi0')).toMatchObject({ role: 'switched', l2: { mode: 'trunk', nativeVlan: 1, allowedVlans: 'all' } })
    expect(ap.wireless?.ssids).toEqual([{ ssid: 'Default', vlan: 1, security: { mode: 'open' } }])
  })

  it('sets up the wireless router like a home router', () => {
    const device = seededFactory().createDevice(modelOf('wirelessRouter'), 'home', 'home')
    expect(portOf(device, 'WAN')).toMatchObject({ role: 'routed', adminUp: true, l3: { ipv4: { addressing: 'dhcp' } } })
    expect(device.routing?.staticRoutes).toEqual([{ prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 254, exitInterfaceId: 'WAN' }])
    expect(device.switching?.svis[0]?.l3.ipv4.address).toBe(HOME_ROUTER_LAN.address)
    expect(device.services?.dhcp?.pools[0]).toMatchObject({ network: '192.168.0.0', defaultRouter: '192.168.0.1' })
    expect(device.services?.dns).toEqual({ enabled: true, forwarders: ['8.8.8.8'], records: [] })
  })

  it('gives the cloud an empty handoff list (every port in service)', () => {
    const cloud = seededFactory().createDevice(modelOf('internetCloud'), 'isp', 'isp')
    expect(cloud.internet).toEqual({ handoffs: [] })
    expect(cloud.ports.every((port) => port.role === 'passive' && port.adminUp)).toBe(true)
  })

  it('creates devices that can be cabled together', () => {
    const factory = seededFactory(3)
    const pc = factory.createDevice(modelOf('pc'), 'pc', 'pc')
    const sw = factory.createDevice(modelOf('switch8'), 'sw', 'sw')
    const state: NetworkState = { devices: [pc, sw], links: [] }
    const cable = new CableRules().autoCable(state, { deviceId: 'pc', portId: 'eth0' }, { deviceId: 'sw', portId: 'Fa0/1' })
    expect(cable).toBe('copperStraight')
  })
})

describe('the models added with the palette redesign', () => {
  const factory = seededFactory(11)
  const devices = [
    ['isp', 'internetCloud'],
    ['dsl', 'dslModem'],
    ['cable', 'cableModem'],
    ['desk', 'switch5'],
    ['tv', 'smartTv'],
    ['mfp', 'multifunctionPrinter'],
    ['edge', 'router3Port'],
    ['hq', 'router4PortSerial'],
    ['branch', 'router2PortSerial'],
    ['floor', 'switch16Poe'],
    ['access', 'switch16'],
    ['core', 'switch24Gig'],
    ['poeCore', 'switch24GigPoe'],
    ['rack', 'rackServer'],
  ].map(([id = '', modelId = '']) => factory.createDevice(modelOf(modelId), id, id))
  const cables: readonly [string, string, string, string][] = [
    ['dsl', 'DSL', 'isp', 'eth0'],
    ['cable', 'Cable', 'isp', 'eth1'],
    ['dsl', 'LAN1', 'desk', 'Gi0/1'],
    ['desk', 'Gi0/2', 'tv', 'eth0'],
    ['edge', 'Gi0/0', 'isp', 'eth2'],
    ['edge', 'Gi0/1', 'floor', 'Fa0/1'],
    ['floor', 'Fa0/2', 'mfp', 'eth0'],
    ['hq', 'Se0/1/0', 'branch', 'Se0/0/0'],
    ['hq', 'Gi0/0', 'core', 'Gi1/0/1'],
    ['core', 'Gi1/1/1', 'poeCore', 'Gi1/1/1'],
    ['core', 'Gi1/0/2', 'rack', 'eth0'],
    ['core', 'Gi1/0/3', 'rack', 'eth1'],
    ['access', 'Gi0/1', 'core', 'Gi1/0/4'],
  ]

  it('can be cabled into one lab that passes StateInvariants', () => {
    const rules = new CableRules()
    let state: NetworkState = { devices, links: [] }
    cables.forEach(([deviceA, portA, deviceB, portB], index) => {
      const a = { deviceId: deviceA, portId: portA }
      const b = { deviceId: deviceB, portId: portB }
      const cable = rules.autoCable(state, a, b)
      expect(cable, `${deviceA} ${portA} – ${deviceB} ${portB}`).not.toBeNull()
      if (cable === null || cable === 'wireless') return
      const link = cable === 'serial' ? { cable, dceEnd: 'a' as const } : { cable }
      state = { ...state, links: [...state.links, { id: `link${index}`, a, b, connected: true, ...link }] }
    })
    expect(state.links).toHaveLength(cables.length)
    expect(invariants.violations(state)).toEqual([])
  })

  it('sets the modems up like the wireless home router (DHCP line port, LAN 192.168.0.1)', () => {
    for (const id of ['dsl', 'cable']) {
      const modem = devices.find((device) => device.id === id)
      const linePort = modem?.ports.find((port) => port.role === 'routed')
      expect(linePort, id).toMatchObject({ adminUp: true, l3: { ipv4: { addressing: 'dhcp' } } })
      expect(modem?.routing?.staticRoutes[0]?.exitInterfaceId, id).toBe(linePort?.id)
      expect(modem?.switching?.svis[0]?.l3.ipv4.address, id).toBe(HOME_ROUTER_LAN.address)
    }
  })

  it('gives the smart TV and the multifunction printer host settings and a Wi-Fi NIC', () => {
    for (const id of ['tv', 'mfp']) {
      const device = devices.find((candidate) => candidate.id === id)
      expect(device?.host, id).toEqual({ defaultGateway: '', dnsServers: [], appLinks: [] })
      expect(device?.ports.map((port) => port.id), id).toEqual(['eth0', 'wlan0'])
    }
  })
})
