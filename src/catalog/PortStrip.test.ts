import { describe, expect, it } from 'vitest'
import type { Device } from '../domain'
import { SeededBaseMacSource } from './BaseMacSource'
import { deviceCatalog, findDeviceModel } from './DeviceCatalog'
import { PortFactory } from './PortFactory'
import { PortStrip } from './PortStrip'

function modelOf(id: string) {
  const model = findDeviceModel(id)
  if (model === undefined) throw new Error(`no model ${id}`)
  return model
}

describe('PortStrip', () => {
  it.each(deviceCatalog.map((model) => [model.id, model] as const))('%s: shows every port exactly once', (_, model) => {
    const ids = PortStrip.forModel(model).sections.flatMap((section) => section.rows.flat())
    expect([...ids].sort()).toEqual(model.ports.map((port) => port.id).sort())
  })

  it('lays out a 24-port switch in two rows (odd on top) with uplinks and console apart', () => {
    const layout = PortStrip.forModel(modelOf('switch24'))
    expect(layout.sections.map((section) => section.group)).toEqual(['access', 'uplink', 'console'])
    const [access, uplink] = layout.sections
    expect(access?.rows[0]?.slice(0, 3)).toEqual(['Fa0/1', 'Fa0/3', 'Fa0/5'])
    expect(access?.rows[1]?.slice(0, 3)).toEqual(['Fa0/2', 'Fa0/4', 'Fa0/6'])
    expect(uplink?.rows).toEqual([['Gi0/1', 'Gi0/2']])
    expect(access?.labelKey).toBe('catalog:portGroups.access.name')
  })

  it('keeps small groups in one row', () => {
    const layout = PortStrip.forModel(modelOf('router2Port'))
    expect(layout.sections.map((section) => [section.group, section.rows])).toEqual([
      ['lan', [['Gi0/0']]],
      ['wan', [['Gi0/1']]],
      ['console', [['Console']]],
    ])
  })

  it('lays out a device by its own ports: unknown ports last, missing model ports left out', () => {
    const model = modelOf('pc')
    const pc = new PortFactory(new SeededBaseMacSource(1)).createDevice(model, 'pc', 'pc')
    const extra: Device = {
      ...pc,
      ports: [{ id: 'wlan0', medium: 'wireless', role: 'host', adminUp: false, l3: { ipv4: { addressing: 'dhcp', address: '', mask: '' } } }],
    }
    expect(PortStrip.forDevice(extra, model).sections).toEqual([
      { group: 'other', labelKey: 'catalog:portGroups.other.name', rows: [['wlan0']] },
    ])
    expect(PortStrip.forDevice(pc, undefined).sections.map((section) => section.group)).toEqual(['other'])
    expect(PortStrip.forDevice(pc, model)).toEqual(PortStrip.forModel(model))
  })
})
