import { describe, expect, it } from 'vitest'
import { findDeviceModel, PortFactory } from '../../../catalog'
import type { DeviceModel, Port } from '../../../domain'
import { portSchema } from '../../../lab/schemas/portSchemas'
import { PortEditorModel, type PortDraft } from './PortEditorModel'
import { SubInterfaceFormModel } from './SubInterfaceFormModel'

function model(id: string): DeviceModel {
  const found = findDeviceModel(id)
  if (!found) throw new Error(id)
  return found
}

function portOf(modelId: string, portId: string): { port: Port; device: ReturnType<typeof PortFactory.createDevice> } {
  const device = PortFactory.createDevice(model(modelId), 'd1', 'D1', { baseMac: '00:11:22:33:44:00' })
  const port = device.ports.find((candidate) => candidate.id === portId)
  if (!port) throw new Error(portId)
  return { port, device }
}

function edit(port: Port, change: Partial<PortDraft>): { draft: PortDraft; next: Port; valid: boolean } {
  const draft = { ...PortEditorModel.toDraft(port), ...change }
  const valid = PortEditorModel.isValid(PortEditorModel.validate(draft, port))
  const next = PortEditorModel.apply(draft, port)
  return { draft, next, valid }
}

describe('PortEditorModel', () => {
  it('round-trips an untouched port of every role unchanged', () => {
    for (const [modelId, portId] of [
      ['switch24', 'Fa0/1'],
      ['router2PortSerial', 'Se0/0/0'],
      ['router2Port', 'Gi0/0'],
      ['pc', 'eth0'],
      ['accessPoint', 'Radio0'],
    ] as const) {
      const found = portOf(modelId, portId)
      expect(PortEditorModel.apply(PortEditorModel.toDraft(found.port), found.port)).toEqual(found.port)
    }
  })

  it('edits a switchport: trunk with native VLAN and an allowed list, access VLAN kept', () => {
    const { port } = portOf('switch24', 'Fa0/1')
    const { next, valid } = edit(port, { mode: 'trunk', nativeVlan: '99', allowedAll: false, allowedList: '1,10-12', accessVlan: 'junk' })
    expect(valid).toBe(true)
    expect(next).toMatchObject({ role: 'switched', l2: { mode: 'trunk', accessVlan: 1, nativeVlan: 99, allowedVlans: [1, 10, 11, 12] } })
    expect(portSchema.safeParse(next).success).toBe(true)
  })

  it('validates VLAN fields of the visible mode only', () => {
    const { port } = portOf('switch24', 'Fa0/1')
    const access = PortEditorModel.validate({ ...PortEditorModel.toDraft(port), accessVlan: '5000', nativeVlan: 'x' }, port)
    expect(access.fields).toEqual({ accessVlan: { key: 'deviceConfig:errors.vlanRange' } })
    const trunk = PortEditorModel.validate({ ...PortEditorModel.toDraft(port), mode: 'trunk', allowedAll: false, allowedList: '9-3' }, port)
    expect(trunk.fields.allowedList?.key).toBe('deviceConfig:errors.vlanListOrder')
  })

  it('requires a valid host address on a static NIC (like v1)', () => {
    const { port } = portOf('pc', 'eth0')
    const blank = PortEditorModel.validate({ ...PortEditorModel.toDraft(port), addressing: 'static', address: '', mask: '' }, port)
    expect(blank.fields).toEqual({
      address: { key: 'deviceConfig:errors.addressRequired' },
      mask: { key: 'deviceConfig:errors.maskRequired' },
    })
    const broadcast = PortEditorModel.validate({ ...PortEditorModel.toDraft(port), addressing: 'static', address: '192.168.1.255', mask: '255.255.255.0' }, port)
    expect(broadcast.fields).toEqual({ address: { key: 'deviceConfig:errors.notHostAddress' } })
    const dhcp = PortEditorModel.validate({ ...PortEditorModel.toDraft(port), addressing: 'dhcp', address: 'junk' }, port)
    expect(dhcp.fields).toEqual({})
  })

  it('lets a routed interface stay unaddressed and keeps the lease when switching to DHCP', () => {
    const { port } = portOf('router2Port', 'Gi0/0')
    expect(PortEditorModel.validate(PortEditorModel.toDraft(port), port).fields).toEqual({})
    const addressed = edit(port, { addressing: 'static', address: ' 10.0.0.1 ', mask: '255.255.255.0' })
    expect(addressed.next).toMatchObject({ l3: { ipv4: { addressing: 'static', address: '10.0.0.1', mask: '255.255.255.0' } } })
    const dhcp = edit(addressed.next, { addressing: 'dhcp', address: '', mask: '' })
    expect(dhcp.next).toMatchObject({ l3: { ipv4: { addressing: 'dhcp', address: '10.0.0.1', mask: '255.255.255.0' } } })
  })

  it('edits sub-interfaces of a routed port', () => {
    const { port } = portOf('router2Port', 'Gi0/0')
    const draft = PortEditorModel.toDraft(port)
    const first = SubInterfaceFormModel.newDraft(draft.subInterfaces)
    const second = SubInterfaceFormModel.newDraft([first])
    expect([first.suffix, second.suffix]).toEqual(['10', '20'])
    const rows = [
      { ...first, address: '192.168.10.1', mask: '255.255.255.0' },
      { ...second, vlan: '10', native: true },
    ]
    const errors = PortEditorModel.validate({ ...draft, subInterfaces: rows }, port)
    expect(errors.subInterfaces[1]).toEqual({ vlan: { key: 'deviceConfig:errors.duplicateDot1q', params: { vlan: 10 } } })
    const fixed = [rows[0], { ...second, vlan: '20', description: ' guests ' }].filter((row) => row !== undefined)
    const { next, valid } = edit(port, { subInterfaces: fixed })
    expect(valid).toBe(true)
    expect(next).toMatchObject({
      subInterfaces: [
        { id: 'Gi0/0.10', vlan: 10, adminUp: true, l3: { ipv4: { address: '192.168.10.1', mask: '255.255.255.0' } } },
        { id: 'Gi0/0.20', vlan: 20, description: 'guests', l3: { ipv4: { address: '', mask: '' } } },
      ],
    })
    expect(portSchema.safeParse(next).success).toBe(true)
    // Round trip keeps the ids.
    const again = PortEditorModel.toDraft(next)
    expect(again.subInterfaces.map((row) => row.suffix)).toEqual(['10', '20'])
  })

  it('refuses duplicate sub-interface numbers and a second native sub-interface', () => {
    const rows = [
      { ...SubInterfaceFormModel.newDraft([]), native: true },
      { ...SubInterfaceFormModel.newDraft([]), vlan: '30', native: true },
      { ...SubInterfaceFormModel.newDraft([]), suffix: '0', vlan: '40' },
    ]
    const errors = SubInterfaceFormModel.validate(rows, 'Gi0/0')
    expect(errors[1]).toEqual({
      suffix: { key: 'deviceConfig:errors.duplicateSubInterface', params: { id: 'Gi0/0.10' } },
      native: { key: 'deviceConfig:errors.duplicateNative' },
    })
    expect(errors[2]).toEqual({ suffix: { key: 'deviceConfig:errors.subInterfaceNumber' } })
  })

  it('sets the clock rate on a serial interface', () => {
    const { port } = portOf('router2PortSerial', 'Se0/0/0')
    const bad = PortEditorModel.validate({ ...PortEditorModel.toDraft(port), clockRate: '64k' }, port)
    expect(bad.fields).toEqual({ clockRate: { key: 'deviceConfig:errors.clockRate' } })
    const { next } = edit(port, { clockRate: '64000' })
    expect(next).toMatchObject({ role: 'routed', serial: { clockRate: 64000 } })
    expect(edit(next, { clockRate: '' }).next).not.toHaveProperty('serial')
  })

  it('offers speeds from the model template, duplex on copper and the role choice on an L3 switch', () => {
    const access = portOf('switch24', 'Fa0/1')
    expect(PortEditorModel.options(access.device, model('switch24'), access.port)).toEqual({ speeds: [10, 100], duplex: true, roleChoice: false, vlanSettings: true })
    const l3 = portOf('l3Switch24', 'Gi1/0/1')
    expect(PortEditorModel.options(l3.device, model('l3Switch24'), l3.port).roleChoice).toBe(true)
    const routed = edit(l3.port, { role: 'routed', addressing: 'static', address: '10.1.1.1', mask: '255.255.255.252', speed: '100', duplex: 'full' })
    expect(routed.next).toMatchObject({ role: 'routed', speed: 100, duplex: 'full', subInterfaces: [] })
    expect(routed.next).not.toHaveProperty('l2')
    expect(portSchema.safeParse(routed.next).success).toBe(true)
    const back = edit(routed.next, { role: 'switched', speed: 'auto', duplex: 'auto' })
    expect(back.next).toMatchObject({ role: 'switched', l2: { mode: 'access', accessVlan: 1 } })
    expect(back.next).not.toHaveProperty('speed')
  })
})
