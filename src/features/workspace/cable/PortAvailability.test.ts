import { describe, expect, it } from 'vitest'
import type { Link } from '../../../domain'
import { cableLab, withLinks } from '../../../domain/testDevices'
import { CableLinkBuilder } from './CableLinkBuilder'
import { PortAvailability } from './PortAvailability'

const availability = new PortAvailability()
const pcLink: Link = {
  id: 'pcLink',
  a: { deviceId: 'pc', portId: 'eth0' },
  b: { deviceId: 'sw', portId: 'Fa0/1' },
  connected: true,
  cable: 'copperStraight',
}
const lab = withLinks(cableLab(), [pcLink])

function statuses(options: ReturnType<PortAvailability['forFirstEnd']>) {
  return Object.fromEntries(options.map((option) => [option.port.id, option.reason ?? option.status]))
}

describe('PortAvailability', () => {
  it('marks free, used and non-fitting ports for a fixed cable', () => {
    const options = availability.forFirstEnd(lab, 'sw', 'copperStraight')
    expect(statuses(options)).toEqual({ 'Fa0/1': 'portInUse', 'Fa0/2': 'free', 'Gi0/1': 'cableDoesNotFitPort', Console: 'cableDoesNotFitPort' })
    expect(options[0]).toMatchObject({ status: 'inUse', linkedTo: { deviceId: 'pc', portId: 'eth0' } })
    expect(options[2]?.status).toBe('incompatible')
  })

  it('accepts any free port as the first end of an auto cable', () => {
    expect(statuses(availability.forFirstEnd(lab, 'sw', 'auto'))).toEqual({
      'Fa0/1': 'portInUse',
      'Fa0/2': 'free',
      'Gi0/1': 'free',
      Console: 'free',
    })
  })

  it('checks the second end of an auto cable against the first', () => {
    const first = { deviceId: 'sw2', portId: 'Gi0/1' }
    expect(statuses(availability.forSecondEnd(lab, first, 'sw', 'auto'))).toEqual({
      'Fa0/1': 'cableDoesNotFitPort',
      'Fa0/2': 'cableDoesNotFitPort',
      'Gi0/1': 'free',
      Console: 'cableDoesNotFitPort',
    })
  })

  it('refuses every port of the first device as the second end', () => {
    const first = { deviceId: 'sw', portId: 'Fa0/2' }
    const options = availability.forSecondEnd(lab, first, 'sw', 'auto')
    expect(options.every((option) => option.reason === 'sameDevice')).toBe(true)
    expect(availability.hasUsablePort(options)).toBe(false)
  })

  it('explains wireless pairs of the wrong roles', () => {
    const first = { deviceId: 'pc', portId: 'wlan0' }
    expect(statuses(availability.forSecondEnd(lab, first, 'laptop', 'auto'))).toEqual({ wlan0: 'wirelessNeedsClientAndRadio' })
  })

  it('keeps radio ports free with associations', () => {
    const builder = new CableLinkBuilder()
    const request = builder.request('wireless', { deviceId: 'laptop', portId: 'wlan0' }, { deviceId: 'ap', portId: 'Radio0' }, 'Office')
    const associated = withLinks(lab, [builder.link(request, 'air')])
    expect(statuses(availability.forFirstEnd(associated, 'ap', 'wireless'))).toEqual({ Gi0: 'cableDoesNotFitPort', Radio0: 'free' })
    expect(builder.ssidOptions(associated, { deviceId: 'laptop', portId: 'wlan0' }, { deviceId: 'ap', portId: 'Radio0' })).toEqual(['Office'])
  })

  it('returns no options for an unknown device', () => {
    expect(availability.forFirstEnd(lab, 'nobody', 'auto')).toEqual([])
  })
})
