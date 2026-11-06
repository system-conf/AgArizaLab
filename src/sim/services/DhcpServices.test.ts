import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { editAddress, editLink, labDevice } from '../../engine/testLabs'
import type { DhcpResult, SimEvent, SimRequest } from '../contract'
import { SimulationKernel } from '../core/SimulationKernel'
import { dhcpLab, hubLab, pool, relayLab, withDhcp } from './testServiceLabs'
import { serviceTestLayers } from './testServiceStack'
import { labRouter } from '../../engine/testLabs'

const RANGE = { start: '192.168.1.100', end: '192.168.1.200' }
const lanPool = (extra: Parameters<typeof pool>[2] = {}) => pool('LAN', '192.168.1', { range: RANGE, ...extra })

function run(network: NetworkState, request: SimRequest) {
  const kernel = SimulationKernel.create(network, serviceTestLayers)
  const id = kernel.inject(request)
  kernel.runUntilDone(id)
  const record = kernel.request(id)
  const result = record?.result
  if (result?.kind !== 'dhcp') throw new Error('no DHCP result')
  return { kernel, record, result, events: kernel.events() }
}

function renew(network: NetworkState, deviceId = 'pc', portId?: string) {
  return run(network, { kind: 'dhcpRenew', deviceId, ...(portId === undefined ? {} : { portId }) })
}

function nicAddress(state: NetworkState, deviceId: string, portId = 'eth0'): string | undefined {
  const port = labDevice(state, deviceId).ports.find((candidate) => candidate.id === portId)
  return port?.role === 'host' ? port.l3.ipv4.address : undefined
}

function macOf(state: NetworkState, deviceId: string): string {
  return labDevice(state, deviceId).ports[0]?.mac ?? ''
}

function trace(events: readonly SimEvent[]) {
  return events.map((event) => [event.time, event.deviceId, event.action, event.reason ?? null])
}

function noteKeys(event: SimEvent | undefined): string[] {
  return (event?.notes ?? []).map((note) => note.message.key)
}

function adapterIp(result: DhcpResult): string | undefined {
  const adapter = result.adapters[0]
  return adapter?.ok && 'ip' in adapter ? adapter.ip : undefined
}

describe('DHCP client and server', () => {
  it('runs DORA: broadcast DISCOVER, OFFER, REQUEST, ACK, then the lease becomes configuration', () => {
    const network = dhcpLab(lanPool())
    const { kernel, record, result, events } = renew(network)
    const mac = macOf(network, 'pc')
    expect(trace(events)).toEqual([
      [0, 'pc', 'created', null],
      [1, 'r', 'replied', null],
      [1, 'r', 'created', null],
      [2, 'pc', 'replied', null],
      [2, 'pc', 'created', null],
      [3, 'r', 'replied', null],
      [3, 'r', 'created', null],
      [4, 'pc', 'delivered', null],
    ])
    expect(events.every((event) => event.protocol === 'dhcp' && event.flowId === record?.id)).toBe(true)
    expect(noteKeys(events[0])).toContain('simulation:notes.services.dhcpDiscoverBroadcast')
    expect(events[1]?.notes[0]?.message).toEqual({ key: 'simulation:notes.services.dhcpOffer', params: { ip: '192.168.1.100', pool: 'LAN' } })
    expect(record?.finishedAt).toBe(4)
    expect(result.adapters).toEqual([
      { portId: 'eth0', ok: true, ip: '192.168.1.100', mask: '255.255.255.0', gateway: '192.168.1.1', dnsServers: ['192.168.1.1'], serverIp: '192.168.1.1' },
    ])
    expect(result.effects).toEqual([
      { kind: 'dhcpLeaseBound', clientId: 'pc', portId: 'eth0', mac, ip: '192.168.1.100', mask: '255.255.255.0', gateway: '192.168.1.1', dnsServers: ['192.168.1.1'], serverId: 'r', poolId: 'LAN' },
    ])
    const state = kernel.network()
    expect(nicAddress(state, 'pc')).toBe('192.168.1.100')
    expect(labDevice(state, 'pc').host).toMatchObject({ defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1'] })
    expect(labDevice(state, 'r').services?.dhcp?.pools[0]?.leases).toEqual([{ mac, ip: '192.168.1.100' }])
    expect(kernel.runtime('pc')?.services.dhcpClients).toMatchObject([{ portId: 'eth0', phase: 'bound', offeredIp: '192.168.1.100', serverIp: '192.168.1.1' }])
    expect(kernel.runtime('r')?.services.dhcpBindings).toMatchObject([{ poolId: 'LAN', ip: '192.168.1.100', mac, state: 'bound' }])
  })

  it('skips excluded addresses', () => {
    const { result } = renew(dhcpLab(lanPool(), [{ start: '192.168.1.100', end: '192.168.1.109' }]))
    expect(adapterIp(result)).toBe('192.168.1.110')
  })

  it('stays silent when the pool is exhausted: the client retries three times, then times out', () => {
    const { record, result, events } = renew(dhcpLab(lanPool({ range: { start: '192.168.1.1', end: '192.168.1.1' } })))
    expect(trace(events.filter((event) => event.deviceId === 'r'))).toEqual([
      [1, 'r', 'dropped', 'dhcpPoolExhausted'],
      [2001, 'r', 'dropped', 'dhcpPoolExhausted'],
      [4001, 'r', 'dropped', 'dhcpPoolExhausted'],
    ])
    expect(result).toEqual({ kind: 'dhcp', operation: 'renew', adapters: [{ portId: 'eth0', ok: false, reason: 'requestTimedOut' }], effects: [] })
    expect(record?.finishedAt).toBe(6000)
  })

  it('times out without a server (3 DISCOVERs 2000 ms apart)', () => {
    const network = dhcpLab()
    const noServer = { ...network, devices: network.devices.map((device) => (device.id === 'r' ? { ...device, services: {} } : device)) }
    const { events, result } = renew(noServer)
    const pc = events.filter((event) => event.deviceId === 'pc')
    expect(trace(pc)).toEqual([
      [0, 'pc', 'created', null],
      [2000, 'pc', 'created', null],
      [4000, 'pc', 'created', null],
      [6000, 'pc', 'timedOut', 'requestTimedOut'],
    ])
    expect(noteKeys(pc[1])).toContain('simulation:notes.services.dhcpRetry')
    expect(result.adapters).toEqual([{ portId: 'eth0', ok: false, reason: 'requestTimedOut' }])
  })

  it('reuses the lease record of the MAC, and replaces a stale one whose address is now taken', () => {
    const base = hubLab([withDhcp(labRouter('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }]), [lanPool()])])
    const mac = macOf(base, 'pc1')
    const leased = (ip: string) => ({
      ...base,
      devices: base.devices.map((device) => (device.id === 'r' ? withDhcp(device, [lanPool({ leases: [{ mac, ip }] })]) : device)),
    })
    expect(adapterIp(renew(leased('192.168.1.150'), 'pc1').result)).toBe('192.168.1.150')

    const taken = editAddress(leased('192.168.1.100'), 'pc2', 'eth0', { addressing: 'static', address: '192.168.1.100', mask: '255.255.255.0' })
    const { kernel, result } = renew(taken, 'pc1')
    expect(adapterIp(result)).toBe('192.168.1.101')
    expect(labDevice(kernel.network(), 'r').services?.dhcp?.pools[0]?.leases).toEqual([{ mac, ip: '192.168.1.101' }])
  })

  it('takes the first OFFER when two servers answer; the other server withdraws its offer', () => {
    const rA = withDhcp(labRouter('rA', [{ id: 'Gi0/0', ip: '192.168.1.1' }]), [lanPool()])
    const rB = withDhcp(labRouter('rB', [{ id: 'Gi0/0', ip: '192.168.1.2' }]), [pool('B', '192.168.1', { range: { start: '192.168.1.201', end: '192.168.1.250' } })])
    const { kernel, result, events } = renew(hubLab([rA, rB]), 'pc1')
    expect(result.adapters[0]).toMatchObject({ ok: true, ip: '192.168.1.100', serverIp: '192.168.1.1' })
    const late = events.find((event) => event.deviceId === 'pc1' && event.action === 'dropped')
    expect(late).toMatchObject({ reason: 'staleReply' })
    const withdrawn = events.find((event) => event.deviceId === 'rB' && noteKeys(event).includes('simulation:notes.services.dhcpOtherServer'))
    expect(withdrawn?.action).toBe('delivered')
    expect(kernel.runtime('rB')?.services.dhcpBindings).toEqual([])
    expect(kernel.runtime('pc2')?.services.dhcpClients).toEqual([])
  })

  it('relays through ip helper-address: giaddr picks the pool, the answer is broadcast by the relay', () => {
    const { kernel, result, events } = renew(relayLab())
    expect(result.adapters[0]).toMatchObject({ ok: true, ip: '192.168.10.2', gateway: '192.168.10.1', serverIp: '10.0.0.2' })
    expect(result.effects[0]).toMatchObject({ serverId: 'r2', poolId: 'VLAN10' })
    const relayed = events.find((event) => event.deviceId === 'r1' && event.action === 'created')
    expect(relayed?.outbound).toMatchObject({ dst: '10.0.0.2', payload: { payload: { messageType: 'discover', relayIp: '192.168.10.1' } } })
    const toClient = events.filter((event) => event.deviceId === 'r1' && noteKeys(event).includes('simulation:notes.services.dhcpRelayToClient'))
    expect(toClient.length).toBeGreaterThanOrEqual(2)
    expect(nicAddress(kernel.network(), 'pc')).toBe('192.168.10.2')
  })

  it('checks the NICs first: static → invalidConfig, unplugged → cableDisconnected', () => {
    const staticPc = editAddress(dhcpLab(), 'pc', 'eth0', { addressing: 'static', address: '192.168.1.5', mask: '255.255.255.0' })
    expect(renew(staticPc).result.adapters).toEqual([{ portId: 'eth0', ok: false, reason: 'invalidConfig' }])
    const unplugged = editLink(dhcpLab(), 'l1', (link) => ({ ...link, connected: false }))
    const { result, events } = renew(unplugged)
    expect(result.adapters).toEqual([{ portId: 'eth0', ok: false, reason: 'cableDisconnected' }])
    expect(trace(events)).toEqual([[0, 'pc', 'dropped', 'cableDisconnected']])
  })

  it('releases: DHCPRELEASE to the server, the address goes, the server keeps the lease record', () => {
    const { kernel } = renew(dhcpLab(lanPool()))
    const id = kernel.inject({ kind: 'dhcpRelease', deviceId: 'pc' })
    kernel.runUntilIdle()
    const record = kernel.request(id)
    expect(record?.result).toMatchObject({ kind: 'dhcp', operation: 'release', adapters: [{ portId: 'eth0', ok: true, released: true }], effects: [{ kind: 'dhcpLeaseReleased', clientId: 'pc', portId: 'eth0' }] })
    const state = kernel.network()
    expect(nicAddress(state, 'pc')).toBe('')
    expect(labDevice(state, 'pc').host).toMatchObject({ defaultGateway: '', dnsServers: [] })
    expect(labDevice(state, 'r').services?.dhcp?.pools[0]?.leases).toHaveLength(1)
    const atServer = kernel.events().filter((event) => event.deviceId === 'r' && event.time > 4)
    expect(atServer.map((event) => [event.action, noteKeys(event)[0]])).toEqual([['delivered', 'simulation:notes.services.dhcpReleaseReceived']])
    expect(kernel.runtime('r')?.services.dhcpBindings).toEqual([])
    expect(kernel.runtime('pc')?.services.dhcpClients).toMatchObject([{ portId: 'eth0', phase: 'released' }])
  })

  it('releases an address that came with the lab file (server found by its lease record)', () => {
    const base = hubLab([withDhcp(labRouter('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }]), [])])
    const mac = macOf(base, 'pc1')
    const leased = editAddress(
      { ...base, devices: base.devices.map((device) => (device.id === 'r' ? withDhcp(device, [lanPool({ leases: [{ mac, ip: '192.168.1.120' }] })]) : device)) },
      'pc1',
      'eth0',
      { address: '192.168.1.120', mask: '255.255.255.0' },
    )
    const { events } = run(leased, { kind: 'dhcpRelease', deviceId: 'pc1' })
    const release = events.find((event) => event.deviceId === 'pc1' && event.action === 'created')
    expect(release?.outbound).toMatchObject({ src: '192.168.1.120', dst: '192.168.1.1', payload: { payload: { messageType: 'release' } } })
  })
})
