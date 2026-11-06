import { describe, expect, it } from 'vitest'
import { deviceCatalog, findDeviceModel } from './DeviceCatalog'
import { PortSummary } from './PortSummary'

function summaryOf(id: string) {
  const model = findDeviceModel(id)
  if (model === undefined) throw new Error(`no model ${id}`)
  return PortSummary.forModel(model)
}

describe('PortSummary', () => {
  it('summarises an access switch with uplinks and PoE', () => {
    expect(summaryOf('switch24Poe')).toEqual({
      parts: [
        { type: 'fastEthernet', count: 24 },
        { type: 'gigabit', count: 2, qualifier: 'uplink' },
      ],
      poe: true,
      console: true,
    })
  })

  it('tells fiber uplinks, serial modules and LAN / WAN ports apart', () => {
    expect(summaryOf('switch48').parts).toEqual([
      { type: 'fastEthernet', count: 48 },
      { type: 'fiber', count: 4, qualifier: 'uplink' },
    ])
    expect(summaryOf('router2PortSerial').parts).toEqual([
      { type: 'gigabit', count: 1, qualifier: 'lan' },
      { type: 'gigabit', count: 1, qualifier: 'wan' },
      { type: 'serial', count: 2 },
    ])
  })

  it('separates Wi-Fi radios from Wi-Fi client NICs', () => {
    expect(summaryOf('wirelessRouter').parts).toEqual([
      { type: 'gigabit', count: 1, qualifier: 'wan' },
      { type: 'gigabit', count: 4, qualifier: 'lan' },
      { type: 'wifiRadio', count: 1 },
    ])
    expect(summaryOf('laptop')).toEqual({
      parts: [
        { type: 'gigabit', count: 1 },
        { type: 'wifiClient', count: 1 },
      ],
      poe: false,
      console: false,
    })
  })

  it('counts every non-console port of every model exactly once', () => {
    for (const model of deviceCatalog) {
      const summary = PortSummary.forModel(model)
      const counted = summary.parts.reduce((sum, part) => sum + part.count, 0)
      expect(counted, model.id).toBe(model.ports.filter((port) => port.medium !== 'console').length)
    }
  })
})
