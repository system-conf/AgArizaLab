import { describe, expect, it } from 'vitest'
import { AddressListParser } from './AddressListParser'
import { VlanListParser } from './VlanListParser'

describe('VlanListParser', () => {
  it('parses single VLANs and ranges, sorted and without duplicates', () => {
    expect(VlanListParser.parse('1,10-12, 30 ,11')).toEqual({ ok: true, vlans: [1, 10, 11, 12, 30] })
    expect(VlanListParser.parse('5 - 6')).toEqual({ ok: true, vlans: [5, 6] })
  })

  it('refuses empty text, junk, out-of-range VLANs and reversed ranges', () => {
    expect(VlanListParser.parse('')).toMatchObject({ ok: false, error: { key: 'deviceConfig:errors.vlanList' } })
    expect(VlanListParser.parse('1,,2')).toMatchObject({ ok: false, error: { key: 'deviceConfig:errors.vlanList' } })
    expect(VlanListParser.parse('ten')).toMatchObject({ ok: false, error: { key: 'deviceConfig:errors.vlanList' } })
    expect(VlanListParser.parse('0')).toMatchObject({ ok: false, error: { key: 'deviceConfig:errors.vlanRange' } })
    expect(VlanListParser.parse('4000-4095')).toMatchObject({ ok: false, error: { key: 'deviceConfig:errors.vlanRange' } })
    expect(VlanListParser.parse('20-10')).toEqual({
      ok: false,
      error: { key: 'deviceConfig:errors.vlanListOrder', params: { part: '20-10' } },
    })
  })

  it('formats lists with ranges and round-trips', () => {
    expect(VlanListParser.format([30, 1, 10, 11, 12])).toBe('1,10-12,30')
    expect(VlanListParser.format([])).toBe('')
    const parsed = VlanListParser.parse(VlanListParser.format([2, 3, 4, 7, 9, 10]))
    expect(parsed).toEqual({ ok: true, vlans: [2, 3, 4, 7, 9, 10] })
  })

  it('checks single VLAN ids', () => {
    expect(VlanListParser.parseId(' 4094 ')).toBe(4094)
    expect(VlanListParser.parseId('4095')).toBeNull()
    expect(VlanListParser.parseId('1.5')).toBeNull()
    expect(VlanListParser.idError('0')).toEqual({ key: 'deviceConfig:errors.vlanRange' })
    expect(VlanListParser.idError('10')).toBeUndefined()
  })
})

describe('AddressListParser', () => {
  it('splits on commas and spaces, keeps order, drops duplicates', () => {
    expect(AddressListParser.parse('8.8.8.8, 1.1.1.1 8.8.8.8')).toEqual({ ok: true, addresses: ['8.8.8.8', '1.1.1.1'] })
    expect(AddressListParser.parse('  ')).toEqual({ ok: true, addresses: [] })
  })

  it('refuses invalid addresses', () => {
    expect(AddressListParser.parse('8.8.8.8, 300.1.1.1')).toEqual({ ok: false, error: { key: 'deviceConfig:errors.addressList' } })
  })
})
