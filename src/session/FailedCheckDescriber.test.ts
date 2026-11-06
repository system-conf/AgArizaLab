import { describe, expect, it } from 'vitest'
import type { DeviceV2, NetworkStateV2 } from '../domain/v2'
import { hostNic, makeDevice } from '../domain/v2/testDevicesV2'
import { FailedCheckDescriber } from './FailedCheckDescriber'

function device(id: string, name: string): DeviceV2 {
  return { ...makeDevice(id, 'pc', [hostNic('eth0')]), name }
}

// Device names arrive already localized (exercise texts) or as user content; they are passed through.
const state: NetworkStateV2 = {
  devices: [device('kasa', 'Cash register (POS)'), device('muhasebe', 'Accounting PC'), device('yazici', 'Printer')],
  links: [],
}

describe('FailedCheckDescriber.describe', () => {
  it('describes an internet condition by the device name', () => {
    expect(FailedCheckDescriber.describe(state, { type: 'internet', fromDeviceId: 'kasa' })).toEqual({
      key: 'session:failedChecks.internet',
      params: { device: 'Cash register (POS)' },
    })
  })

  it('describes a resolves condition as a symptom without naming DNS', () => {
    const condition = { type: 'resolves', fromDeviceId: 'muhasebe', name: 'google.com' } as const
    const message = FailedCheckDescriber.describe(state, condition)
    expect(message).toEqual({
      key: 'session:failedChecks.resolves',
      params: { device: 'Accounting PC', name: 'google.com' },
    })
    expect(message.key).not.toMatch(/dns/i)
  })

  it('describes an appLinksOk condition without naming the broken target', () => {
    expect(FailedCheckDescriber.describe(state, { type: 'appLinksOk', deviceId: 'muhasebe' })).toEqual({
      key: 'session:failedChecks.appLinksOk',
      params: { device: 'Accounting PC' },
    })
  })

  it('describes a reachable condition with both device names', () => {
    const condition = { type: 'reachable', fromDeviceId: 'muhasebe', toDeviceId: 'yazici' } as const
    expect(FailedCheckDescriber.describe(state, condition)).toEqual({
      key: 'session:failedChecks.reachable',
      params: { from: 'Accounting PC', to: 'Printer' },
    })
  })

  it('falls back to the device id for unknown devices', () => {
    expect(FailedCheckDescriber.describe(state, { type: 'internet', fromDeviceId: 'missing' }).params).toEqual({
      device: 'missing',
    })
  })
})

describe('FailedCheckDescriber.describeFailures', () => {
  it('lists only failing conditions, in order, without duplicates', () => {
    const internet = { type: 'internet', fromDeviceId: 'kasa' } as const
    const resolves = { type: 'resolves', fromDeviceId: 'kasa', name: 'odeme.ornekbanka.com.tr' } as const
    const reachable = { type: 'reachable', fromDeviceId: 'muhasebe', toDeviceId: 'yazici' } as const
    const messages = FailedCheckDescriber.describeFailures(state, [
      { condition: internet, ok: false },
      { condition: resolves, ok: true },
      { condition: reachable, ok: false },
      { condition: internet, ok: false },
    ])
    expect(messages.map((message) => message.key)).toEqual([
      'session:failedChecks.internet',
      'session:failedChecks.reachable',
    ])
  })

  it('returns nothing when every condition holds', () => {
    const internet = { type: 'internet', fromDeviceId: 'kasa' } as const
    expect(FailedCheckDescriber.describeFailures(state, [{ condition: internet, ok: true }])).toEqual([])
  })
})
