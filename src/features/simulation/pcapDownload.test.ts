import { describe, expect, it } from 'vitest'
import { pcapFileName } from './pcapDownload'

describe('pcapFileName', () => {
  it('keeps the lab title and replaces characters file systems refuse', () => {
    expect(pcapFileName('Ofis: VLAN/DHCP?', 'Simulation')).toBe('Ofis_ VLAN_DHCP_.pcap')
    expect(pcapFileName('Mağaza ağı', 'Simulation')).toBe('Mağaza ağı.pcap')
  })

  it('falls back when the title is empty', () => {
    expect(pcapFileName('   ', 'Simülasyon')).toBe('Simülasyon.pcap')
  })
})
