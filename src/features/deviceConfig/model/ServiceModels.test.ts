import { describe, expect, it } from 'vitest'
import type { Device, HostSettings } from '../../../domain'
import { cableLab } from '../../../domain/testDevices'
import { deviceServicesSchema, internetSettingsSchema } from '../../../lab/schemas/serviceSchemas'
import { hostSettingsSchema, wirelessSettingsSchema } from '../../../lab/schemas/deviceSchemas'
import { DhcpPoolFormModel, type DhcpDraft } from './DhcpPoolFormModel'
import { DnsServiceFormModel } from './DnsServiceFormModel'
import { GeneralFormModel } from './GeneralFormModel'
import { InternetServiceModel } from './InternetServiceModel'
import { HostSettingsModel } from './HostSettingsModel'
import { SsidFormModel } from './SsidFormModel'

describe('DhcpPoolFormModel', () => {
  const existing = {
    enabled: true,
    pools: [
      {
        id: 'LAN',
        network: '192.168.1.0',
        mask: '255.255.255.0',
        range: { start: '192.168.1.100', end: '192.168.1.199' },
        defaultRouter: '192.168.1.1',
        dnsServers: ['192.168.1.1'],
        leases: [{ mac: 'AA:BB:CC:00:00:01', ip: '192.168.1.100' }],
      },
    ],
    excludedRanges: [{ start: '192.168.1.1', end: '192.168.1.1' }],
  }

  it('round-trips a server and keeps leases', () => {
    const draft = DhcpPoolFormModel.toDraft(existing)
    expect(draft.excluded[0]?.end).toBe('')
    expect(DhcpPoolFormModel.isValid(DhcpPoolFormModel.validate(draft))).toBe(true)
    expect(DhcpPoolFormModel.apply(draft)).toEqual(existing)
  })

  it('starts disabled and empty for a device without a server, adds a pool', () => {
    const draft = DhcpPoolFormModel.toDraft(undefined)
    expect(draft).toEqual({ enabled: false, pools: [], excluded: [] })
    const pool = { ...DhcpPoolFormModel.newPool([]), network: '10.0.10.0', mask: '255.255.255.0', defaultRouter: '10.0.10.1', dnsServers: '8.8.8.8, 1.1.1.1' }
    const next: DhcpDraft = { enabled: true, pools: [pool], excluded: [{ ...DhcpPoolFormModel.newExcluded(), start: '10.0.10.1', end: '10.0.10.9' }] }
    expect(DhcpPoolFormModel.isValid(DhcpPoolFormModel.validate(next))).toBe(true)
    const applied = DhcpPoolFormModel.apply(next)
    expect(applied.pools[0]).toEqual({
      id: 'POOL1',
      network: '10.0.10.0',
      mask: '255.255.255.0',
      defaultRouter: '10.0.10.1',
      dnsServers: ['8.8.8.8', '1.1.1.1'],
      leases: [],
    })
    expect(deviceServicesSchema.safeParse({ dhcp: applied }).success).toBe(true)
  })

  it('validates names, network, range, router, DNS list and exclusions', () => {
    const draft = DhcpPoolFormModel.toDraft(existing)
    const [pool] = draft.pools
    if (!pool) throw new Error('pool')
    const errors = DhcpPoolFormModel.validate({
      ...draft,
      pools: [pool, { ...pool, key: 'b', network: '192.168.1.5', rangeStart: '192.168.1.9', rangeEnd: '', defaultRouter: 'x', dnsServers: '1.1.1' }],
      excluded: [
        { key: 'e1', start: '10.0.0.9', end: '10.0.0.1' },
        { key: 'e2', start: '', end: '' },
      ],
    })
    expect(errors.pools[1]).toEqual({
      name: { key: 'deviceConfig:errors.duplicateName', params: { name: 'LAN' } },
      network: { key: 'deviceConfig:errors.prefixNotNetwork', params: { network: '192.168.1.0' } },
      rangeEnd: { key: 'deviceConfig:errors.rangeIncomplete' },
      defaultRouter: { key: 'deviceConfig:errors.invalidAddress' },
      dnsServers: { key: 'deviceConfig:errors.addressList' },
    })
    expect(errors.excluded).toEqual([{ end: { key: 'deviceConfig:errors.rangeOrder' } }, { start: { key: 'deviceConfig:errors.addressRequired' } }])
  })
})

describe('DnsServiceFormModel', () => {
  it('edits forwarders and records; names are stored in lower case', () => {
    const draft = DnsServiceFormModel.toDraft({ enabled: true, forwarders: ['8.8.8.8'], records: [] })
    expect(draft.forwarders).toBe('8.8.8.8')
    const next = { ...draft, forwarders: '8.8.8.8, 1.1.1.1', records: [{ ...DnsServiceFormModel.newRecord(), name: ' Intranet.Local ', address: '192.168.1.10' }] }
    expect(DnsServiceFormModel.isValid(DnsServiceFormModel.validate(next))).toBe(true)
    const applied = DnsServiceFormModel.apply(next)
    expect(applied).toEqual({ enabled: true, forwarders: ['8.8.8.8', '1.1.1.1'], records: [{ type: 'A', name: 'intranet.local', address: '192.168.1.10' }] })
    expect(deviceServicesSchema.safeParse({ dns: applied }).success).toBe(true)
  })

  it('refuses bad host names, duplicates, addresses and forwarders', () => {
    const errors = DnsServiceFormModel.validate({
      enabled: true,
      forwarders: 'dns.google',
      records: [
        { key: 'a', name: 'pos.local', address: '10.0.0.5' },
        { key: 'b', name: 'POS.local', address: '' },
        { key: 'c', name: 'bad_name', address: '10.0.0.300' },
      ],
    })
    expect(errors).toEqual({
      forwarders: { key: 'deviceConfig:errors.addressList' },
      records: [
        {},
        { name: { key: 'deviceConfig:errors.duplicateRecord', params: { name: 'pos.local' } }, address: { key: 'deviceConfig:errors.addressRequired' } },
        { name: { key: 'deviceConfig:errors.hostName' }, address: { key: 'deviceConfig:errors.invalidAddress' } },
      ],
    })
  })
})

describe('SsidFormModel', () => {
  it('edits SSIDs with VLAN and open security', () => {
    const wireless = { ssids: [{ ssid: 'Office', vlan: 1, security: { mode: 'open' as const } }] }
    const rows = [...SsidFormModel.toDrafts(wireless), { ...SsidFormModel.newDraft(), ssid: ' Guest ', vlan: '20' }]
    expect(SsidFormModel.validate(rows)).toEqual([{}, {}])
    const applied = SsidFormModel.apply(rows, wireless)
    expect(applied.ssids[1]).toEqual({ ssid: 'Guest', vlan: 20, security: { mode: 'open' } })
    expect(wirelessSettingsSchema.safeParse(applied).success).toBe(true)
  })

  it('refuses blank, too long and duplicate names and bad VLANs', () => {
    const errors = SsidFormModel.validate([
      { key: 'a', ssid: '', vlan: '1', security: 'open' },
      { key: 'b', ssid: 'ş'.repeat(17), vlan: '1', security: 'open' },
      { key: 'c', ssid: 'Office', vlan: '0', security: 'open' },
      { key: 'd', ssid: 'Office', vlan: '1', security: 'open' },
    ])
    expect(errors).toEqual([
      { ssid: { key: 'deviceConfig:errors.required' } },
      { ssid: { key: 'deviceConfig:errors.tooLong', params: { max: 32 } } },
      { vlan: { key: 'deviceConfig:errors.vlanRange' } },
      { ssid: { key: 'deviceConfig:errors.duplicateName', params: { name: 'Office' } } },
    ])
  })
})

describe('HostSettingsModel', () => {
  const host: HostSettings = { defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1', '8.8.8.8', '1.1.1.1'], appLinks: [] }

  it('edits gateway and DNS, keeps extra DNS servers, validates format only', () => {
    const draft = HostSettingsModel.toDraft(host)
    expect(draft).toEqual({ gateway: '192.168.1.1', dnsPrimary: '192.168.1.1', dnsSecondary: '8.8.8.8' })
    expect(HostSettingsModel.validate({ ...draft, gateway: '10.9.9.9' })).toEqual({})
    expect(HostSettingsModel.validate({ ...draft, dnsSecondary: '8.8.8' })).toEqual({ dnsSecondary: { key: 'deviceConfig:errors.invalidAddress' } })
    expect(HostSettingsModel.apply({ gateway: '', dnsPrimary: '', dnsSecondary: '9.9.9.9' }, host)).toEqual({
      defaultGateway: '',
      dnsServers: ['9.9.9.9', '1.1.1.1'],
      appLinks: [],
    })
  })

  it('adds app links with fresh ids', () => {
    const withLink = { ...host, appLinks: [{ id: 'appLink1', label: 'Printer', targetIp: '192.168.1.50', targetKind: 'printer' as const }] }
    const rows = [...HostSettingsModel.appLinkDrafts(withLink), { ...HostSettingsModel.newAppLink(), label: ' Kitchen ', targetIp: '192.168.1.60', targetKind: 'kitchenDisplay' as const }]
    expect(HostSettingsModel.validateAppLinks(rows)).toEqual([{}, {}])
    const applied = HostSettingsModel.applyAppLinks(rows, withLink)
    expect(applied.appLinks[1]).toEqual({ id: 'appLink2', label: 'Kitchen', targetIp: '192.168.1.60', targetKind: 'kitchenDisplay' })
    expect(hostSettingsSchema.safeParse(applied).success).toBe(true)
    expect(HostSettingsModel.validateAppLinks([{ ...HostSettingsModel.newAppLink() }])).toEqual([
      { label: { key: 'deviceConfig:errors.required' }, targetIp: { key: 'deviceConfig:errors.addressRequired' } },
    ])
  })
})

describe('GeneralFormModel and InternetServiceModel', () => {
  it('validates device names', () => {
    expect(GeneralFormModel.nameError('  ')).toEqual({ key: 'deviceConfig:errors.required' })
    expect(GeneralFormModel.nameError('x'.repeat(41))).toEqual({ key: 'deviceConfig:errors.tooLong', params: { max: 40 } })
    expect(GeneralFormModel.nameError('Router 1')).toBeUndefined()
  })

  it('maps cloud ports to service lines and back', () => {
    const cloud = cableLab().devices.find((device) => device.id === 'cloud') as Device
    const withTwo: Device = { ...cloud, ports: [...cloud.ports, { id: 'eth1', medium: 'copper', role: 'passive', adminUp: true }], internet: { handoffs: [{ portId: 'eth1', serviceUp: true }] } }
    const lines = InternetServiceModel.serviceLines(withTwo)
    expect(lines).toEqual([{ portId: 'coax0', serviceUp: true }, { portId: 'eth1', serviceUp: true }])
    const applied = InternetServiceModel.apply([{ portId: 'coax0', serviceUp: false }, { portId: 'eth1', serviceUp: true }], withTwo)
    expect(applied).toEqual({ handoffs: [{ portId: 'coax0', serviceUp: false }, { portId: 'eth1', serviceUp: true }] })
    expect(internetSettingsSchema.safeParse(applied).success).toBe(true)
  })
})
