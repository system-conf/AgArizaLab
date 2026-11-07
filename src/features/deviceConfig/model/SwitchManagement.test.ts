import { describe, expect, it } from 'vitest'
import { findDeviceModel, PortFactory } from '../../../catalog'
import type { DeviceModel } from '../../../domain'
import { DeviceSections } from './DeviceSections'
import { PortEditorModel } from './PortEditorModel'
import { SwitchManagement } from './SwitchManagement'

function model(id: string): DeviceModel {
  const found = findDeviceModel(id)
  if (!found) throw new Error(id)
  return found
}

function device(modelId: string) {
  return PortFactory.createDevice(model(modelId), 'd1', 'D1', { baseMac: '00:11:22:33:44:00' })
}

describe('SwitchManagement', () => {
  it('locks VLAN settings only on unmanaged switches (switching without CLI or routing)', () => {
    expect(SwitchManagement.vlansConfigurable(model('switch5'))).toBe(false)
    for (const id of ['switch8', 'switch24Poe', 'l3Switch24', 'wirelessRouter', 'dslModem', 'accessPoint', 'router2Port', 'pc']) {
      expect(SwitchManagement.vlansConfigurable(model(id)), id).toBe(true)
    }
    expect(SwitchManagement.vlansConfigurable(undefined)).toBe(true)
  })

  it('hides the VLAN database and SVI cards of an unmanaged switch', () => {
    const unmanaged = device('switch5')
    expect(unmanaged.switching).toBeDefined()
    expect(DeviceSections.of(unmanaged, model('switch5'))).not.toContain('vlans')
    expect(DeviceSections.of(unmanaged, model('switch5'))).not.toContain('svis')
    expect(DeviceSections.of(unmanaged, model('switch5'))).toContain('ports')
    expect(DeviceSections.of(device('switch8'), model('switch8'))).toEqual(expect.arrayContaining(['vlans', 'svis']))
    // Home routers keep their LAN SVI card (routing capability).
    expect(DeviceSections.of(device('wirelessRouter'), model('wirelessRouter'))).toEqual(expect.arrayContaining(['vlans', 'svis']))
  })

  it('offers no switchport mode or VLAN fields on an unmanaged switch port', () => {
    const unmanaged = device('switch5')
    const port = unmanaged.ports.find((candidate) => candidate.role === 'switched')
    if (!port) throw new Error('switch5 has no switchport')
    expect(PortEditorModel.options(unmanaged, model('switch5'), port)).toMatchObject({ vlanSettings: false, speeds: [10, 100, 1000] })
  })
})
