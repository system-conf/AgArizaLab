import { describe, expect, it } from 'vitest'
import { LinkLightChecker } from './LinkLightChecker'
import { deepFreeze, officeNetwork, updateDevice, updateLink, updatePort, vlanNetwork } from './testFixtures'

const checker = new LinkLightChecker()

describe('LinkLightChecker', () => {
  it('is up for a plugged cable between powered devices', () => {
    expect(checker.light(officeNetwork(), 'pc1Link')).toBe('up')
    expect(checker.light(officeNetwork(), 'wan')).toBe('up')
    expect(checker.light(officeNetwork(), 'uplink')).toBe('up')
  })

  it('is down for an unplugged cable', () => {
    expect(checker.light(updateLink(officeNetwork(), 'pc1Link', { connected: false }), 'pc1Link')).toBe('down')
  })

  it('is down when the switch port is disabled', () => {
    expect(checker.light(updatePort(officeNetwork(), 'switch', 'Fa0/2', { enabled: false }), 'pc1Link')).toBe('down')
  })

  it('is down when the switch port does not exist', () => {
    const state = updateLink(officeNetwork(), 'pc1Link', { b: { deviceId: 'switch', portId: 'Fa0/9' } })
    expect(checker.light(state, 'pc1Link')).toBe('down')
  })

  it('is down when an end device is powered off', () => {
    const state = updateDevice(officeNetwork(), 'pc1', (device) => ({ ...device, powered: false }))
    expect(checker.light(state, 'pc1Link')).toBe('down')
  })

  it('is up for a wireless client on a known SSID', () => {
    expect(checker.light(vlanNetwork(), 'phoneLink')).toBe('up')
  })

  it('is down for a wireless client on an unknown SSID', () => {
    expect(checker.light(updateLink(vlanNetwork(), 'phoneLink', { ssid: 'Yok' }), 'phoneLink')).toBe('down')
  })

  it('stays up on the wrong VLAN, since the light ignores configuration', () => {
    const state = updatePort(vlanNetwork(), 'switch', 'Fa0/2', { vlan: 20 })
    expect(checker.light(state, 'kasaLink')).toBe('up')
  })

  it('does not mutate the state', () => {
    const state = deepFreeze(officeNetwork())
    expect(() => checker.light(state, 'pc1Link')).not.toThrow()
  })

  it('throws for an unknown link id', () => {
    expect(() => checker.light(officeNetwork(), 'nope')).toThrow('Unknown link id: nope')
  })
})
