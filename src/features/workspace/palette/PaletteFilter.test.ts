import { describe, expect, it } from 'vitest'
import { normalizeSearchText, PaletteFilter } from './PaletteFilter'

const filter = new PaletteFilter([
  { modelId: 'switch24Poe', name: 'PoE switch (24 ports)', searchText: '24× Fa · 2× Gi uplink · PoE Fa0/1 poe' },
  { modelId: 'switch48', name: 'Switch (48 ports)', searchText: '48× Fa · 4× Gi fiber uplink' },
  { modelId: 'ipPhone', name: 'IP phone', searchText: 'Voice VLAN and PoE practice' },
  { modelId: 'accessPoint', name: 'Kablosuz erişim noktası', searchText: 'Wi-Fi yayını' },
])

describe('PaletteFilter', () => {
  it('matches nothing for a blank query', () => {
    expect(filter.search('')).toEqual([])
    expect(filter.search('   ')).toEqual([])
  })

  it('finds models by port count and capability words', () => {
    expect(filter.search('48')).toEqual(['switch48'])
    expect(filter.search('POE')).toEqual(['switch24Poe', 'ipPhone'])
  })

  it('needs every word of the query', () => {
    expect(filter.search('poe 24')).toEqual(['switch24Poe'])
    expect(filter.search('poe fiber')).toEqual([])
  })

  it('ranks name matches before matches in the other texts', () => {
    expect(filter.search('phone')).toEqual(['ipPhone'])
    expect(filter.search('switch')).toEqual(['switch24Poe', 'switch48'])
    expect(filter.search('uplink')).toEqual(['switch24Poe', 'switch48'])
  })

  it('ignores case, accents, the dotless i and the × sign', () => {
    expect(filter.search('ERISIM')).toEqual(['accessPoint'])
    expect(filter.search('yayini')).toEqual(['accessPoint'])
    expect(filter.search('24x fa')).toEqual(['switch24Poe'])
    expect(normalizeSearchText('İnternet Çıkışı')).toBe('internet cikisi')
  })
})
