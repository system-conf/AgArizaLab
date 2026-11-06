import { describe, expect, it } from 'vitest'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { editLink, editSwitchport } from './testLabs'
import { officeLab, powerOff, shutPort, unplug, vlanLab } from './testNetworks'

const engine = new DefaultNetworkEngine()

/** Recursively freezes a value so any mutation attempt throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

describe('link lights', () => {
  it('is up for a plugged cable between powered devices', () => {
    expect(engine.linkLight(officeLab(), 'pc1Link')).toBe('up')
    expect(engine.linkLight(officeLab(), 'wan')).toBe('up')
    expect(engine.linkLight(officeLab(), 'uplink')).toBe('up')
  })

  it('is down for an unplugged cable', () => {
    expect(engine.linkLight(unplug(officeLab(), 'pc1Link'), 'pc1Link')).toBe('down')
  })

  it('is down when the switch port is disabled', () => {
    expect(engine.linkLight(shutPort(officeLab(), 'switch', 'Fa0/2'), 'pc1Link')).toBe('down')
  })

  it('is down when the switch port does not exist', () => {
    const state = editLink(officeLab(), 'pc1Link', (link) => ({ ...link, b: { deviceId: 'switch', portId: 'Fa0/9' } }))
    expect(engine.linkLight(state, 'pc1Link')).toBe('down')
  })

  it('is down when an end device is powered off', () => {
    expect(engine.linkLight(powerOff(officeLab(), 'pc1'), 'pc1Link')).toBe('down')
  })

  it('is up for a wireless client on a known SSID', () => {
    expect(engine.linkLight(vlanLab(), 'phoneLink')).toBe('up')
  })

  it('is down for a wireless client on an unknown SSID', () => {
    const state = editLink(vlanLab(), 'phoneLink', (link) => ({ ...link, cable: 'wireless', ssid: 'Yok' }))
    expect(engine.linkLight(state, 'phoneLink')).toBe('down')
  })

  it('stays up on the wrong VLAN, since the light ignores configuration', () => {
    const state = editSwitchport(vlanLab(), 'switch', 'Fa0/2', { accessVlan: 20 })
    expect(engine.linkLight(state, 'kasaLink')).toBe('up')
  })

  it('does not mutate the state', () => {
    const state = deepFreeze(officeLab())
    expect(() => engine.linkLight(state, 'pc1Link')).not.toThrow()
  })

  it('throws for an unknown link id', () => {
    expect(() => engine.linkLight(officeLab(), 'nope')).toThrow('Unknown link id: nope')
  })
})
