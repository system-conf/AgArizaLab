import { describe, expect, it } from 'vitest'
import type { V1Device } from './v1Types'
import { StateInvariants, type Device, type NetworkState, type Port } from '../../domain'
import { scenarioDefinitions } from '../../scenarios/scenarioDefinitions'
import { V1_DEVICE_MAP } from './v1DeviceMap'
import { migrateV1Exercise, migrateV1Layout, migrateV1ToV2 } from './V1ToV2Migration'

function deviceOf(state: NetworkState, id: string): Device {
  const device = state.devices.find((candidate) => candidate.id === id)
  if (!device) throw new Error(`no device ${id}`)
  return device
}

function portOf(device: Device, id: string): Port {
  const port = device.ports.find((candidate) => candidate.id === id)
  if (!port) throw new Error(`no port ${device.id}:${id}`)
  return port
}

function networkOf(ip: string, mask: string): string {
  const maskOctets = mask.split('.').map(Number)
  return ip
    .split('.')
    .map((octet, index) => Number(octet) & (maskOctets[index] ?? 0))
    .join('.')
}

/** The port that keeps the v1 device MAC (MODEL_V2 §11). */
function primaryPortId(device: V1Device, migrated: Device): string | undefined {
  switch (device.kind) {
    case 'router':
      return 'Gi0/0'
    case 'accessPoint':
      return 'Gi0'
    case 'internet':
      return 'eth0'
    case 'switch':
      return undefined
    default:
      return migrated.ports.find((port) => port.role === 'host' && port.mac === device.mac)?.id
  }
}

describe.each(scenarioDefinitions.map((definition) => [definition.id, definition] as const))('migrating %s', (_, definition) => {
  const v1 = definition.initialState
  const v2 = migrateV1ToV2(v1)

  it('keeps every device and link id in order', () => {
    expect(v2.devices.map((device) => device.id)).toEqual(v1.devices.map((device) => device.id))
    expect(v2.links.map((link) => link.id)).toEqual(v1.links.map((link) => link.id))
  })

  it('satisfies every v2 invariant (link ends exist, unique port ids and MACs, valid cables)', () => {
    expect(new StateInvariants().violations(v2)).toEqual([])
  })

  it('is deterministic and leaves the v1 state untouched', () => {
    const before = JSON.stringify(v1)
    expect(migrateV1ToV2(v1)).toEqual(v2)
    expect(JSON.stringify(v1)).toBe(before)
  })

  it('keeps kind, model, name, power and MACs', () => {
    for (const device of v1.devices) {
      const migrated = deviceOf(v2, device.id)
      expect(migrated.kind).toBe(V1_DEVICE_MAP[device.kind].kind)
      expect(migrated.name).toBe(device.name)
      expect(migrated.powered).toBe(device.powered)
      expect(migrated.baseMac).toBe(device.mac)
      const primary = primaryPortId(device, migrated)
      if (primary !== undefined) expect(portOf(migrated, primary).mac).toBe(device.mac)
    }
  })

  it('keeps host addressing, gateway, DNS and app links', () => {
    for (const device of v1.devices.filter((candidate) => candidate.host !== undefined)) {
      const migrated = deviceOf(v2, device.id)
      const nic = migrated.ports.find((port) => port.mac === device.mac)
      expect(nic?.role).toBe('host')
      if (nic?.role !== 'host') continue
      expect(nic.l3.ipv4).toEqual({ addressing: device.host?.mode, address: device.host?.ip, mask: device.host?.mask })
      expect(migrated.host?.defaultGateway).toBe(device.host?.gateway)
      expect(migrated.host?.dnsServers).toEqual(device.host?.dns)
      expect(migrated.host?.appLinks.map((appLink) => [appLink.id, appLink.label, appLink.targetIp])).toEqual(
        (device.appLinks ?? []).map((appLink) => [appLink.id, appLink.label, appLink.targetIp]),
      )
    }
  })

  it('keeps switch ports 1:1 and puts every used VLAN into the VLAN database', () => {
    const usedVlans = new Set<number>([1])
    for (const device of v1.devices) {
      for (const port of device.switchPorts ?? []) usedVlans.add(port.vlan)
      for (const routerInterface of device.routerInterfaces ?? []) usedVlans.add(routerInterface.vlan)
      for (const network of device.wirelessNetworks ?? []) usedVlans.add(network.vlan)
    }
    for (const device of v1.devices.filter((candidate) => candidate.kind === 'switch')) {
      const migrated = deviceOf(v2, device.id)
      for (const switchPort of device.switchPorts ?? []) {
        const port = portOf(migrated, switchPort.id)
        expect(port.role).toBe('switched')
        if (port.role !== 'switched') continue
        expect(port.adminUp).toBe(switchPort.enabled)
        expect(port.l2.mode).toBe(switchPort.mode)
        expect(port.l2.accessVlan).toBe(switchPort.vlan)
        expect(port.poe).toBe(switchPort.poe ? 'auto' : undefined)
      }
      expect(migrated.switching?.vlans.map((vlan) => vlan.id)).toEqual([...usedVlans].sort((a, b) => a - b))
    }
  })

  it('keeps router interfaces, DHCP pools, DNS forwarding and the WAN state', () => {
    for (const router of v1.devices.filter((candidate) => candidate.kind === 'router')) {
      const migrated = deviceOf(v2, router.id)
      const lan = portOf(migrated, 'Gi0/0')
      if (lan.role !== 'routed') throw new Error('Gi0/0 must be routed')
      for (const routerInterface of router.routerInterfaces ?? []) {
        const target = routerInterface.vlan === 1 ? lan : lan.subInterfaces.find((sub) => sub.vlan === routerInterface.vlan)
        expect(target?.l3.ipv4).toEqual({ addressing: 'static', address: routerInterface.ip, mask: routerInterface.mask })
        expect(target?.description).toBe(routerInterface.id)
      }
      for (const pool of router.dhcpPools ?? []) {
        const migratedPool = migrated.services?.dhcp?.pools.find((candidate) => candidate.id === pool.id)
        expect(migratedPool).toEqual({
          id: pool.id,
          network: networkOf(pool.rangeStart, pool.mask),
          mask: pool.mask,
          range: { start: pool.rangeStart, end: pool.rangeEnd },
          defaultRouter: pool.gateway,
          dnsServers: pool.dns,
          leases: pool.leases,
        })
        const servedBy = (router.routerInterfaces ?? []).find((candidate) => candidate.vlan === pool.vlan)
        expect(servedBy && networkOf(servedBy.ip, servedBy.mask)).toBe(migratedPool?.network)
      }
      expect(migrated.services?.dns).toEqual({ enabled: router.dnsForwarding === true, forwarders: ['8.8.8.8'], records: [] })
      expect(migrated.routing?.staticRoutes).toEqual([
        { prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 },
      ])
      const wanLink = v2.links.find((link) => [link.a, link.b].some((end) => end.deviceId === router.id && end.portId === 'Gi0/1'))
      const cloudEnd = wanLink && [wanLink.a, wanLink.b].find((end) => end.deviceId !== router.id)
      const handoff = cloudEnd && deviceOf(v2, cloudEnd.deviceId).internet?.handoffs.find((entry) => entry.portId === cloudEnd.portId)
      expect(handoff?.serviceUp).toBe(router.wanUp === true)
    }
  })

  it('keeps SSIDs of access points', () => {
    for (const ap of v1.devices.filter((candidate) => candidate.kind === 'accessPoint')) {
      expect(deviceOf(v2, ap.id).wireless?.ssids).toEqual(
        (ap.wirelessNetworks ?? []).map((network) => ({ ...network, security: { mode: 'open' } })),
      )
    }
  })

  it('keeps links: plugged state, SSID and the v1 port behind each end', () => {
    const portNames: Record<string, string> = { lan: 'Gi0/0', wan: 'Gi0/1', uplink: 'Gi0', radio: 'Radio0' }
    v1.links.forEach((link, index) => {
      const migrated = v2.links[index]
      expect(migrated?.connected).toBe(link.connected)
      expect(migrated?.cable === 'wireless' ? migrated.ssid : undefined).toBe(link.ssid)
      for (const side of ['a', 'b'] as const) {
        const end = link[side]
        if (deviceOf(v2, end.deviceId).kind === 'internet') continue
        expect(migrated?.[side]).toEqual({ deviceId: end.deviceId, portId: portNames[end.portId] ?? end.portId })
      }
    })
  })

  it('moves positions into the layout', () => {
    expect(migrateV1Layout(v1).devices).toEqual(
      Object.fromEntries(v1.devices.map((device) => [device.id, device.position])),
    )
  })

  it('turns the scenario into an exercise', () => {
    const exercise = migrateV1Exercise(definition)
    expect(exercise.id).toBe(definition.id)
    expect(exercise.order).toBe(definition.order)
    expect(exercise.solvedWhen).toEqual(definition.solvedWhen)
    expect(exercise.locks).toEqual([])
    expect(exercise.lab.state).toEqual(v2)
  })
})
