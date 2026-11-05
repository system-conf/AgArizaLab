import { describe, expect, it } from 'vitest'
import { cameraSubnet } from '../scenarios/cameraSubnet'
import { posGateway } from '../scenarios/posGateway'
import { printerDhcp } from '../scenarios/printerDhcp'
import { wrongDns } from '../scenarios/wrongDns'
import { FailedCheckDescriber } from './FailedCheckDescriber'

describe('FailedCheckDescriber.describe', () => {
  it('describes an internet condition by the device name', () => {
    expect(FailedCheckDescriber.describe(posGateway.initialState, { type: 'internet', fromDeviceId: 'kasa' })).toBe(
      'Kasa (POS) hâlâ internete çıkamıyor.',
    )
  })

  it('describes a resolves condition as a symptom without naming DNS', () => {
    const condition = { type: 'resolves', fromDeviceId: 'muhasebe', name: 'google.com' } as const
    const sentence = FailedCheckDescriber.describe(wrongDns.initialState, condition)
    expect(sentence).toBe("PC Muhasebe hâlâ 'google.com' sitesini açamıyor.")
    expect(sentence).not.toMatch(/DNS|çöz/)
  })

  it('describes an appLinksOk condition without naming the broken target', () => {
    expect(FailedCheckDescriber.describe(cameraSubnet.initialState, { type: 'appLinksOk', deviceId: 'nvr' })).toBe(
      'Kayıt Cihazı (NVR) bazı cihazlara hâlâ ulaşamıyor.',
    )
  })

  it('describes a reachable condition with both device names', () => {
    const condition = { type: 'reachable', fromDeviceId: 'muhasebe', toDeviceId: 'yazici' } as const
    expect(FailedCheckDescriber.describe(printerDhcp.initialState, condition)).toBe(
      'PC Muhasebe hâlâ Yazıcı cihazına ulaşamıyor.',
    )
  })

  it('falls back to the device id for unknown devices', () => {
    expect(FailedCheckDescriber.describe(posGateway.initialState, { type: 'internet', fromDeviceId: 'yok' })).toBe(
      'yok hâlâ internete çıkamıyor.',
    )
  })
})

describe('FailedCheckDescriber.describeFailures', () => {
  it('lists only failing conditions, in order, without duplicates', () => {
    const internet = { type: 'internet', fromDeviceId: 'kasa' } as const
    const resolves = { type: 'resolves', fromDeviceId: 'kasa', name: 'odeme.ornekbanka.com.tr' } as const
    const sentences = FailedCheckDescriber.describeFailures(posGateway.initialState, [
      { condition: internet, ok: false },
      { condition: resolves, ok: true },
      { condition: internet, ok: false },
    ])
    expect(sentences).toEqual(['Kasa (POS) hâlâ internete çıkamıyor.'])
  })

  it('returns nothing when every condition holds', () => {
    const internet = { type: 'internet', fromDeviceId: 'kasa' } as const
    expect(FailedCheckDescriber.describeFailures(posGateway.initialState, [{ condition: internet, ok: true }])).toEqual([])
  })
})
