import { describe, expect, it } from 'vitest'
import type { Device, LabDocument, NetworkState } from '../../domain'
import { accessMode, labHost, labLink, labRouter, labSwitch } from '../../engine/testLabs'
import { campus } from '../testCampus'
import { officeBrief } from '../testBriefs'
import { HandoverPack, type HandoverSource } from './HandoverPack'

const META: LabDocument['meta'] = { title: 'Office', author: 'Ayşe', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-06T12:30:00.000Z' }

function source(state: NetworkState, extra: Partial<HandoverSource> = {}): HandoverSource {
  const layout = { devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: 120 * index, y: 400 }])) }
  return { meta: META, state, layout, annotations: [], ...extra }
}

describe('HandoverPack on a solved design brief', () => {
  const brief = officeBrief()
  const zone = { id: 'front', type: 'rectangle' as const, color: 'blue' as const, at: { x: 0, y: 350 }, width: 300, height: 200, label: 'Front desk', filled: false }
  const doc = source(brief.reference.state, { annotations: [zone] })
  const pack = HandoverPack.build(doc, { brief })

  it('summarises the topology and the brief result', () => {
    expect(pack.meta).toEqual({ ...META, briefId: 'testOffice' })
    expect(pack.summary).toMatchObject({ devices: 7, devicesOff: 0, links: 6, unpluggedLinks: 0, subnets: 1, vlans: 1 })
    expect(pack.summary.byKind.map((line) => [line.kind, line.count])).toEqual([
      ['internet', 1],
      ['router', 1],
      ['switch', 1],
      ['pc', 3],
      ['printer', 1],
    ])
    expect(pack.summary.byCable).toEqual([{ cable: 'copperStraight', count: 6, label: { key: 'workspace:cableTools.copperStraight' } }])
    expect(pack.summary.zones).toEqual([{ annotationId: 'front', label: 'Front desk', deviceIds: ['isp', 'pc1', 'pc2'] }])
    expect(pack.summary.brief).toEqual({ passed: 11, total: 11, solved: true, cost: 860, budget: 1000 })
  })

  it('builds the IP plan with gateway, DHCP scope and the settled leases', () => {
    expect(pack.ipPlan).toHaveLength(1)
    const [office] = pack.ipPlan
    expect(office).toMatchObject({ network: '192.168.10.0/24', mask: '255.255.255.0', vlans: [1], usable: 254 })
    expect(office?.gateways).toEqual([{ deviceId: 'router', deviceName: 'router', interfaceId: 'Gi0/0', address: '192.168.10.1', addressing: 'static' }])
    expect(office?.dhcp).toEqual([
      {
        deviceId: 'router',
        deviceName: 'router',
        poolId: 'office',
        start: '192.168.10.100',
        end: '192.168.10.200',
        excluded: [],
        defaultRouter: '192.168.10.1',
        dnsServers: ['192.168.10.1'],
      },
    ])
    // The PCs of the reference design never ran ipconfig /renew: the pack documents the network as it runs.
    expect(office?.members.map((member) => [member.deviceId, member.address, member.addressing])).toEqual([
      ['pc1', '192.168.10.100', 'dhcp'],
      ['pc2', '192.168.10.101', 'dhcp'],
      ['pc3', '192.168.10.102', 'dhcp'],
      ['printer', '192.168.10.50', 'static'],
      ['router', '192.168.10.1', 'static'],
    ])
    expect(brief.reference.state.devices.find((device) => device.id === 'pc1')?.ports[0]).toMatchObject({ l3: { ipv4: { address: '' } } })
  })

  it('lists the VLAN with its cabled access ports and no unaddressed SVI', () => {
    expect(pack.vlans).toEqual([
      {
        vlan: 1,
        names: ['default'],
        subnets: ['192.168.10.0/24'],
        accessPorts: [{ deviceId: 'switch', deviceName: 'switch', portIds: ['Fa0/1', 'Fa0/2', 'Fa0/3', 'Fa0/4', 'Fa0/5'] }],
        trunkPorts: [],
        interfaces: [],
        ssids: [],
      },
    ])
  })

  it('lists devices with model, management address, zone, origin and ports in use', () => {
    const byId = new Map(pack.devices.map((device) => [device.deviceId, device]))
    expect(byId.get('pc1')).toEqual({
      deviceId: 'pc1',
      deviceName: 'pc1',
      kind: 'pc',
      kindLabel: { key: 'catalog:kinds.pc' },
      modelId: 'pc',
      model: { key: 'catalog:models.pc.name' },
      managementIp: '192.168.10.100/24',
      powered: true,
      zone: 'Front desk',
      provided: true,
      ports: { used: 1, total: 1 },
    })
    expect(byId.get('router')).toMatchObject({ managementIp: '192.168.10.1/24', provided: false, ports: { used: 2, total: 3 } })
    expect(byId.get('switch')?.managementIp).toBeUndefined()
    expect(byId.get('pc3')?.zone).toBeUndefined()
  })

  it('orients every cable from the network side and shows switchport modes', () => {
    expect(pack.cabling.map((row) => `${row.from.deviceId} ${row.from.portId} > ${row.to.deviceId} ${row.to.portId}`)).toEqual([
      'router Gi0/1 > isp eth0',
      'switch Fa0/1 > router Gi0/0',
      'switch Fa0/2 > pc1 eth0',
      'switch Fa0/3 > pc2 eth0',
      'switch Fa0/4 > pc3 eth0',
      'switch Fa0/5 > printer eth0',
    ])
    expect(pack.cabling[1]).toMatchObject({
      from: { mode: { key: 'design:handover.portMode.access', params: { vlan: 1 } } },
      cable: 'copperStraight',
      cableLabel: { key: 'workspace:cableTools.copperStraight' },
      connected: true,
    })
  })

  it('summarises the configuration, routers first', () => {
    expect(pack.configs.map((config) => config.deviceId)).toEqual(['router', 'pc1', 'pc2', 'pc3', 'printer'])
    expect(pack.configs[0]?.items).toEqual([
      { label: { key: 'design:handover.config.interface', params: { interface: 'Gi0/0' } }, value: '192.168.10.1/24' },
      { label: { key: 'design:handover.config.interface', params: { interface: 'Gi0/1' } }, value: { key: 'design:handover.values.dhcpProvider' } },
      { label: { key: 'design:handover.config.route', params: { destination: '0.0.0.0/0' } }, value: 'Gi0/1' },
      {
        label: { key: 'design:handover.config.dhcpPool', params: { pool: 'office' } },
        value: {
          key: 'design:handover.values.dhcpPool',
          params: { network: '192.168.10.0/24', start: '192.168.10.100', end: '192.168.10.200', gateway: '192.168.10.1', dns: '192.168.10.1' },
        },
      },
      { label: { key: 'design:handover.config.dnsForwarders' }, value: '8.8.8.8' },
    ])
    expect(pack.configs[1]?.items[0]?.value).toEqual({ key: 'design:handover.values.dhcpAddress', params: { address: '192.168.10.100/24' } })
  })

  it('has no open issues', () => {
    expect(pack.issues).toEqual([])
  })
})

describe('HandoverPack open issues', () => {
  it('lists the unmet requirements of the brief (hidden ones included) before the lab issues', () => {
    const brief = officeBrief()
    const pack = HandoverPack.build(source(brief.lab.state), { brief })
    const requirementIssues = pack.issues.filter((issue) => issue.source === 'requirement')
    expect(requirementIssues.map((issue) => issue.requirementId)).toEqual(['officeOnline', 'officeDns', 'printing', 'officeDhcp', 'plan', 'oneSegment', 'hasRouter', 'printingOffline', 'printerOnline'])
    expect(requirementIssues.at(-1)).toMatchObject({ hidden: true, message: { key: 'design:requirements.internet' } })
    expect(requirementIssues.find((issue) => issue.requirementId === 'printingOffline')).toMatchObject({ qualifier: { key: 'design:failures.device' } })
    expect(pack.issues.filter((issue) => issue.source === 'lab').map((issue) => issue.source === 'lab' && `${issue.code} ${issue.subjectId}`)).toEqual([
      'notCabled pc1',
      'notCabled pc2',
      'notCabled pc3',
      'notCabled printer',
    ])
    expect(pack.devices.every((device) => device.provided === true)).toBe(true)
  })

  it('finds unfinished parts of any lab without a brief', () => {
    const off: Device = { ...labHost('off', '10.0.0.9'), powered: false }
    const state: NetworkState = {
      devices: [
        labRouter('r1', [{ id: 'Gi0/0', ip: '10.0.0.1' }]),
        labSwitch('sw', Array.from({ length: 8 }, () => accessMode(1))),
        labHost('blank', ''),
        labHost('client', '', { addressing: 'dhcp' }),
        labHost('dupA', '10.0.0.5', { gateway: '10.0.0.1' }),
        labHost('dupB', '10.0.0.5'),
        labHost('alone', '10.0.0.7'),
        off,
      ],
      links: [
        labLink('up', ['r1', 'Gi0/0'], ['sw', 'Fa0/1']),
        labLink('l1', ['blank', 'eth0'], ['sw', 'Fa0/2']),
        labLink('l2', ['client', 'eth0'], ['sw', 'Fa0/3']),
        labLink('l3', ['dupA', 'eth0'], ['sw', 'Fa0/4']),
        { ...labLink('l4', ['dupB', 'eth0'], ['sw', 'Fa0/5']), connected: false },
        labLink('l5', ['off', 'eth0'], ['sw', 'Fa0/6']),
      ],
    }
    const pack = HandoverPack.build(source(state))
    expect(pack.summary.brief).toBeUndefined()
    expect(pack.devices.every((device) => device.provided === undefined)).toBe(true)
    expect(pack.issues).toEqual([
      { source: 'lab', code: 'noAddress', subjectId: 'blank', message: { key: 'design:handover.issues.noAddress', params: { device: 'blank', interface: 'eth0' } } },
      { source: 'lab', code: 'dhcpNoAnswer', subjectId: 'client', message: { key: 'design:handover.issues.dhcpNoAnswer', params: { device: 'client', interface: 'eth0' } } },
      { source: 'lab', code: 'noGateway', subjectId: 'dupB', message: { key: 'design:handover.issues.noGateway', params: { device: 'dupB' } } },
      { source: 'lab', code: 'notCabled', subjectId: 'alone', message: { key: 'design:handover.issues.notCabled', params: { device: 'alone' } } },
      { source: 'lab', code: 'deviceOff', subjectId: 'off', message: { key: 'design:handover.issues.deviceOff', params: { device: 'off' } } },
      { source: 'lab', code: 'linkUnplugged', subjectId: 'l4', message: { key: 'design:handover.issues.linkUnplugged', params: { a: 'dupB', b: 'sw' } } },
      { source: 'lab', code: 'duplicateAddress', subjectId: '10.0.0.5', message: { key: 'design:handover.issues.duplicateAddress', params: { address: '10.0.0.5', devices: 'dupA, dupB' } } },
    ])
    expect(pack.summary).toMatchObject({ devicesOff: 1, unpluggedLinks: 1 })
    expect(pack.cabling.find((row) => row.linkId === 'l4')?.connected).toBe(false)
  })
})

describe('HandoverPack on a VLAN campus', () => {
  const pack = HandoverPack.build(source(campus()))

  it('maps subnets to VLANs with router-on-a-stick gateways and pools', () => {
    expect(pack.ipPlan.map((subnet) => [subnet.network, subnet.vlans, subnet.gateways.map((gateway) => gateway.interfaceId), subnet.members.length])).toEqual([
      ['10.10.0.0/24', [10], ['Gi0/0.10'], 51],
      ['10.20.0.0/24', [20], ['Gi0/0.20'], 45],
    ])
    expect(pack.ipPlan[0]?.dhcp[0]).toMatchObject({ poolId: 'vlan10', start: '10.10.0.1', end: '10.10.0.254', excluded: [{ start: '10.10.0.1', end: '10.10.0.20' }] })
    expect(pack.ipPlan[1]?.dhcp[0]?.excluded).toEqual([])
  })

  it('lists access ports and trunks per switch and the VLAN interfaces', () => {
    const vlan10 = pack.vlans.find((row) => row.vlan === 10)
    expect(vlan10?.names).toEqual(['VLAN10'])
    expect(vlan10?.subnets).toEqual(['10.10.0.0/24'])
    expect(vlan10?.accessPorts[0]).toEqual({ deviceId: 'core', deviceName: 'core', portIds: ['Fa0/6', 'Fa0/7'] })
    expect(vlan10?.accessPorts[1]?.portIds).toHaveLength(12)
    expect(vlan10?.trunkPorts.map((group) => [group.deviceId, group.portIds.length])).toEqual([
      ['core', 5],
      ['acc1', 1],
      ['acc2', 1],
      ['acc3', 1],
      ['acc4', 1],
    ])
    expect(vlan10?.interfaces).toEqual([{ deviceId: 'router', deviceName: 'router', interfaceId: 'Gi0/0.10', address: '10.10.0.1' }])
    expect(pack.vlans.map((row) => row.vlan)).toEqual([1, 10, 20])
  })

  it('documents sub-interfaces, exclusions and trunk modes', () => {
    const router = pack.configs.find((config) => config.deviceId === 'router')
    expect(router?.items[0]).toEqual({
      label: { key: 'design:handover.config.vlanInterface', params: { interface: 'Gi0/0.10', vlan: 10 } },
      value: '10.10.0.1/24',
    })
    expect(router?.items.find((item) => item.label.key === 'design:handover.config.dhcpExcluded')?.value).toBe('10.10.0.1 – 10.10.0.20')
    expect(pack.configs.find((config) => config.deviceId === 'core')?.items).toEqual([
      { label: { key: 'design:handover.config.vlans' }, value: '1 default, 10 VLAN10, 20 VLAN20' },
    ])
    expect(pack.cabling.find((row) => row.linkId === 'core1')?.from.mode).toEqual({ key: 'design:handover.portMode.trunkAll', params: { native: 1 } })
    expect(pack.issues).toEqual([])
  })
})
