import { describe, expect, it } from 'vitest'
import type { HostNetworkConfig } from '../../domain/NetworkTypes'
import { HostSettingsFormModel, type HostDraft } from './HostSettingsFormModel'

const host: HostNetworkConfig = {
  mode: 'static',
  ip: '192.168.1.20',
  mask: '255.255.255.0',
  gateway: '192.168.1.1',
  dns: ['8.8.8.8'],
}

function draftWith(patch: Partial<HostDraft>): HostDraft {
  return { ...HostSettingsFormModel.toDraft(host), ...patch }
}

describe('HostSettingsFormModel', () => {
  it('round-trips a static host through the draft, trimming and dropping empty DNS fields', () => {
    const draft = draftWith({ ip: ' 192.168.1.30 ', dnsSecondary: '' })
    expect(draft.dnsPrimary).toBe('8.8.8.8')
    expect(HostSettingsFormModel.toHost(draft, host)).toEqual({ ...host, ip: '192.168.1.30', dns: ['8.8.8.8'] })
  })

  it('keeps the previous addresses when switching to DHCP', () => {
    const draft = draftWith({ mode: 'dhcp', ip: 'çöp' })
    expect(HostSettingsFormModel.validate(draft)).toEqual({})
    expect(HostSettingsFormModel.toHost(draft, host)).toEqual({ ...host, mode: 'dhcp' })
  })

  it('reports required, format and mask errors in static mode', () => {
    const errors = HostSettingsFormModel.validate(draftWith({ ip: '', mask: '255.0.255.0', gateway: '192.168.1', dnsSecondary: 'x' }))
    expect(errors).toEqual({
      ip: { key: 'device:hostForm.errors.ipRequired' },
      mask: { key: 'device:hostForm.errors.invalidMask' },
      gateway: { key: 'device:hostForm.errors.invalidAddress' },
      dnsSecondary: { key: 'device:hostForm.errors.invalidAddress' },
    })
    expect(HostSettingsFormModel.validate(draftWith({ mask: '' })).mask).toEqual({ key: 'device:hostForm.errors.maskRequired' })
    expect(HostSettingsFormModel.validate(draftWith({ ip: '192.168.1.300' })).ip).toEqual({
      key: 'device:hostForm.errors.invalidAddress',
    })
    expect(HostSettingsFormModel.validate(draftWith({}))).toEqual({})
  })

  it('rejects the network and broadcast address of the subnet as host IP', () => {
    const notHost = { key: 'device:hostForm.errors.notHostAddress' }
    expect(HostSettingsFormModel.validate(draftWith({ ip: '192.168.1.0' })).ip).toEqual(notHost)
    expect(HostSettingsFormModel.validate(draftWith({ ip: '192.168.1.255' })).ip).toEqual(notHost)
    // Same address is a valid host under a wider mask.
    expect(HostSettingsFormModel.validate(draftWith({ ip: '192.168.1.0', mask: '255.255.254.0' }))).toEqual({})
    // With an invalid mask only the mask error is reported.
    expect(HostSettingsFormModel.validate(draftWith({ ip: '192.168.1.0', mask: '255.0.255.0' })).ip).toBeUndefined()
  })

  it('shows only errors of non-empty fields while typing', () => {
    const draft = draftWith({ ip: '', gateway: 'abc' })
    const live = HostSettingsFormModel.liveErrors(HostSettingsFormModel.validate(draft), draft)
    expect(Object.keys(live)).toEqual(['gateway'])
  })
})
