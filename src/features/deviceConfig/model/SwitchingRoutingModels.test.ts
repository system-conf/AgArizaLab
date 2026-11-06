import { describe, expect, it } from 'vitest'
import { findDeviceModel, PortFactory } from '../../../catalog'
import type { Device, DeviceModel, RoutingSettings, SwitchingSettings } from '../../../domain'
import { routingSettingsSchema, switchingSettingsSchema } from '../../../lab/schemas/deviceSchemas'
import { StaticRouteFormModel, type StaticRouteDraft } from './StaticRouteFormModel'
import { SviFormModel } from './SviFormModel'
import { VlanDatabaseModel } from './VlanDatabaseModel'

function model(id: string): DeviceModel {
  const found = findDeviceModel(id)
  if (!found) throw new Error(id)
  return found
}

function switching(device: Device): SwitchingSettings {
  if (!device.switching) throw new Error('no switching')
  return device.switching
}

describe('VlanDatabaseModel', () => {
  it('adds, renames and sorts VLANs; blank names get the IOS default', () => {
    const rows = VlanDatabaseModel.toDrafts([{ id: 1, name: 'default' }, { id: 20, name: 'Kitchen' }])
    const added = [...rows, { ...VlanDatabaseModel.newDraft(), id: '10' }, { ...VlanDatabaseModel.newDraft(), id: '5', name: ' Office ' }]
    expect(VlanDatabaseModel.validate(added).every((row) => Object.keys(row).length === 0)).toBe(true)
    expect(VlanDatabaseModel.apply(added)).toEqual([
      { id: 1, name: 'default' },
      { id: 5, name: 'Office' },
      { id: 10, name: 'VLAN0010' },
      { id: 20, name: 'Kitchen' },
    ])
  })

  it('keeps VLAN 1, refuses duplicates, bad ids and long names', () => {
    const rows = VlanDatabaseModel.toDrafts([{ id: 1, name: 'default' }, { id: 10, name: 'a' }])
    expect(rows.map((row) => VlanDatabaseModel.isRemovable(row))).toEqual([false, true])
    expect(VlanDatabaseModel.apply(rows.slice(1))[0]).toEqual({ id: 1, name: 'default' })
    const errors = VlanDatabaseModel.validate([
      ...rows,
      { ...VlanDatabaseModel.newDraft(), id: '10' },
      { ...VlanDatabaseModel.newDraft(), id: '4095', name: 'x'.repeat(33) },
    ])
    expect(errors[2]).toEqual({ id: { key: 'deviceConfig:errors.duplicateVlan', params: { vlan: 10 } } })
    expect(errors[3]).toEqual({
      id: { key: 'deviceConfig:errors.vlanRange' },
      name: { key: 'deviceConfig:errors.tooLong', params: { max: 32 } },
    })
  })

  it('lists the ports, SVI and SSIDs that use a VLAN', () => {
    const base = PortFactory.createDevice(model('switch8'), 'sw', 'SW', { baseMac: '00:11:22:33:44:00' })
    const ports = base.ports.map((port) => {
      if (port.role !== 'switched') return port
      if (port.id === 'Fa0/1') return { ...port, l2: { ...port.l2, accessVlan: 10 } }
      if (port.id === 'Fa0/2') return { ...port, l2: { ...port.l2, mode: 'trunk' as const, allowedVlans: [1, 10] } }
      if (port.id === 'Fa0/3') return { ...port, l2: { ...port.l2, mode: 'trunk' as const } }
      return port
    })
    const device: Device = {
      ...base,
      ports,
      switching: { ...switching(base), svis: [{ vlan: 10, adminUp: true, l3: { ipv4: { addressing: 'static', address: '', mask: '' } } }] },
      wireless: { ssids: [{ ssid: 'Guest', vlan: 10, security: { mode: 'open' } }] },
    }
    expect(VlanDatabaseModel.usage(device, 10)).toEqual(['Fa0/1', 'Fa0/2', 'Vlan10', 'Guest'])
    expect(VlanDatabaseModel.usage(device, 30)).toEqual([])
  })
})

describe('SviFormModel', () => {
  const sw = PortFactory.createDevice(model('switch8'), 'sw', 'SW', { baseMac: '00:11:22:33:44:00' })

  it('adds an SVI and the default gateway', () => {
    const draft = SviFormModel.toDraft({ ...switching(sw), svis: [] })
    const next = {
      svis: [
        { ...SviFormModel.newDraft(), vlan: '20', address: '192.168.20.2', mask: '255.255.255.0' },
        { ...SviFormModel.newDraft(), vlan: '1', address: '192.168.1.2', mask: '255.255.255.0' },
      ],
      defaultGateway: ' 192.168.1.1 ',
    }
    expect(draft.svis).toEqual([])
    expect(SviFormModel.validate(next)).toEqual({ rows: [{}, {}] })
    const applied = SviFormModel.apply(next, switching(sw))
    expect(applied).toMatchObject({
      svis: [
        { vlan: 1, adminUp: true, l3: { ipv4: { addressing: 'static', address: '192.168.1.2', mask: '255.255.255.0' } } },
        { vlan: 20, adminUp: true },
      ],
      defaultGateway: '192.168.1.1',
    })
    expect(switchingSettingsSchema.safeParse(applied).success).toBe(true)
  })

  it('refuses duplicate VLANs, bad addresses and a bad gateway', () => {
    const errors = SviFormModel.validate({
      svis: [
        { ...SviFormModel.newDraft(), vlan: '10' },
        { ...SviFormModel.newDraft(), vlan: '10', address: '10.0.0.0', mask: '255.0.0.0' },
      ],
      defaultGateway: 'gateway',
    })
    expect(errors).toEqual({
      rows: [{}, { vlan: { key: 'deviceConfig:errors.duplicateVlan', params: { vlan: 10 } }, address: { key: 'deviceConfig:errors.notHostAddress' } }],
      defaultGateway: { key: 'deviceConfig:errors.invalidAddress' },
    })
  })
})

describe('StaticRouteFormModel', () => {
  const router = PortFactory.createDevice(model('router2Port'), 'r1', 'R1', { baseMac: '00:11:22:33:44:00' })
  const routing: RoutingSettings = router.routing ?? { ipRouting: true, staticRoutes: [] }
  const interfaces = StaticRouteFormModel.exitInterfaces(router)
  const route = (change: Partial<StaticRouteDraft>): StaticRouteDraft => ({ ...StaticRouteFormModel.newDraft(), ...change })

  it('lists routed ports as exit interfaces (no console, no NICs)', () => {
    expect(interfaces).toEqual(['Gi0/0', 'Gi0/1'])
  })

  it('builds routes with a next hop, an exit interface or both', () => {
    const rows = [
      route({ prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1' }),
      route({ prefix: '10.20.0.0', mask: '255.255.0.0', nextHop: '192.168.1.254', adminDistance: '200' }),
      route({ prefix: '10.30.0.0', mask: '255.255.0.0', nextHop: '192.168.1.254', exitInterfaceId: 'Gi0/0' }),
    ]
    expect(StaticRouteFormModel.validate(rows, interfaces)).toEqual([{}, {}, {}])
    const applied = StaticRouteFormModel.apply({ ipRouting: true, routes: rows }, routing)
    expect(applied.staticRoutes).toEqual([
      { prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, exitInterfaceId: 'Gi0/1' },
      { prefix: '10.20.0.0', mask: '255.255.0.0', adminDistance: 200, nextHop: '192.168.1.254' },
      { prefix: '10.30.0.0', mask: '255.255.0.0', adminDistance: 1, nextHop: '192.168.1.254', exitInterfaceId: 'Gi0/0' },
    ])
    expect(routingSettingsSchema.safeParse(applied).success).toBe(true)
    expect(StaticRouteFormModel.toDraft(applied).routes.map((row) => row.exitInterfaceId)).toEqual(['Gi0/1', '', 'Gi0/0'])
  })

  it('validates prefix, mask, next hop, interface, distance and duplicates', () => {
    const errors = StaticRouteFormModel.validate(
      [
        route({ prefix: '10.20.1.0', mask: '255.255.0.0', nextHop: '1.1.1.1' }),
        route({ prefix: '10.0.0.0', mask: '255.0.255.0' }),
        route({ prefix: '10.0.0.0', mask: '255.0.0.0', nextHop: 'x', exitInterfaceId: 'Gi9/9', adminDistance: '0' }),
        route({ prefix: '10.1.0.0', mask: '255.255.0.0', nextHop: '1.1.1.1' }),
        route({ prefix: '10.1.0.0', mask: '255.255.0.0', nextHop: '1.1.1.1' }),
      ],
      interfaces,
    )
    expect(errors[0]).toEqual({ prefix: { key: 'deviceConfig:errors.prefixNotNetwork', params: { network: '10.20.0.0' } } })
    expect(errors[1]).toEqual({ mask: { key: 'deviceConfig:errors.invalidMask' }, nextHop: { key: 'deviceConfig:errors.nextHopOrExit' } })
    expect(errors[2]).toEqual({
      nextHop: { key: 'deviceConfig:errors.invalidAddress' },
      exitInterfaceId: { key: 'deviceConfig:errors.unknownInterface', params: { id: 'Gi9/9' } },
      adminDistance: { key: 'deviceConfig:errors.adminDistance' },
    })
    expect(errors[3]).toEqual({})
    expect(errors[4]).toEqual({ prefix: { key: 'deviceConfig:errors.duplicateRoute' } })
  })

  it('switches ip routing (L3 switch)', () => {
    const l3 = PortFactory.createDevice(model('l3Switch24'), 's1', 'S1', { baseMac: '00:11:22:33:44:00' })
    const settings = l3.routing ?? { ipRouting: false, staticRoutes: [] }
    expect(settings.ipRouting).toBe(false)
    expect(StaticRouteFormModel.apply({ ...StaticRouteFormModel.toDraft(settings), ipRouting: true }, settings).ipRouting).toBe(true)
  })
})
