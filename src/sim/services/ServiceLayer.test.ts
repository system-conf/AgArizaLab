import { describe, expect, it } from 'vitest'
import { editAddress } from '../../engine/testLabs'
import { Topology } from '../../engine/Topology'
import type { NetworkState } from '../../domain'
import type { DeviceContext } from '../contract'
import { SimulationKernel } from '../core/SimulationKernel'
import { serviceLayer } from './index'
import { dhcpLab, dnsLab, pool, relayLab, webLab } from './testServiceLabs'
import { serviceTestLayers } from './testServiceStack'

function renewEvents(network: NetworkState, seed: number) {
  const kernel = SimulationKernel.create(network, serviceTestLayers, { seed })
  kernel.runUntilDone(kernel.inject({ kind: 'dhcpRenew', deviceId: 'pc' }))
  kernel.runUntilDone(kernel.inject({ kind: 'dnsQuery', deviceId: 'pc', name: 'google.com', servers: ['8.8.8.8'] }))
  kernel.runUntilIdle()
  return { kernel, events: kernel.events(), transmissions: kernel.transmissions() }
}

/** A context good enough for `listens` (it reads the device, its runtime and nothing else). */
function contextOf(kernel: SimulationKernel, deviceId: string): DeviceContext {
  const device = kernel.network().devices.find((candidate) => candidate.id === deviceId)
  const runtime = kernel.runtime(deviceId)
  if (!device || !runtime) throw new Error(`no device ${deviceId}`)
  const unused = () => {
    throw new Error('not used by listens')
  }
  return {
    now: kernel.time,
    device,
    network: kernel.network(),
    topology: Topology.of(kernel.network()),
    runtime,
    layers: serviceTestLayers,
    updateRuntime: unused,
    random: unused,
    arrival: null,
    openEvent: unused,
    newPdu: unused,
    newFrameId: unused,
    schedule: unused,
    report: unused,
    applyEffect: unused,
  }
}

describe('services layer', () => {
  it('is deterministic: same lab + seed → same events; another seed → other transaction ids only', () => {
    const lab = relayLab()
    const first = renewEvents(lab, 7)
    const second = renewEvents(lab, 7)
    expect(JSON.stringify(second.events)).toBe(JSON.stringify(first.events))
    expect(JSON.stringify(second.transmissions)).toBe(JSON.stringify(first.transmissions))
    const other = renewEvents(lab, 8)
    expect(other.events.map((event) => [event.time, event.deviceId, event.action])).toEqual(first.events.map((event) => [event.time, event.deviceId, event.action]))
    expect(JSON.stringify(other.events)).not.toBe(JSON.stringify(first.events))
  })

  it('listens on DHCP, DNS and HTTP ports by role', () => {
    const relay = SimulationKernel.create(relayLab(), serviceTestLayers)
    expect(serviceLayer.listens(contextOf(relay, 'r1'), 'udp', '255.255.255.255', 67)).toBe(true)
    expect(serviceLayer.listens(contextOf(relay, 'r2'), 'udp', '10.0.0.2', 67)).toBe(true)
    expect(serviceLayer.listens(contextOf(relay, 'pc'), 'udp', '255.255.255.255', 67)).toBe(false)
    expect(serviceLayer.listens(contextOf(relay, 'pc'), 'udp', '255.255.255.255', 68)).toBe(false)

    const dns = SimulationKernel.create(dnsLab({ forwarders: ['8.8.8.8'] }, { enabled: false }), serviceTestLayers)
    expect(serviceLayer.listens(contextOf(dns, 'r1'), 'udp', '192.168.1.1', 53)).toBe(true)
    expect(serviceLayer.listens(contextOf(dns, 'r2'), 'udp', '10.0.0.2', 53)).toBe(false)
    expect(serviceLayer.listens(contextOf(dns, 'printer'), 'udp', '192.168.1.50', 53)).toBe(false)
    expect(serviceLayer.listens(contextOf(dns, 'internet'), 'udp', '8.8.8.8', 53)).toBe(true)
    expect(serviceLayer.listens(contextOf(dns, 'internet'), 'udp', '10.0.0.1', 53)).toBe(false)

    const web = SimulationKernel.create(webLab(), serviceTestLayers)
    expect(serviceLayer.listens(contextOf(web, 'internet'), 'tcp', '142.250.187.206', 80)).toBe(true)
    expect(serviceLayer.listens(contextOf(web, 'internet'), 'tcp', '142.250.187.206', 443)).toBe(false)
    expect(serviceLayer.listens(contextOf(web, 'pc'), 'tcp', '192.168.1.10', 80)).toBe(false)
  })

  it('keeps client leases of DHCP NICs only and bindings of existing pools', () => {
    const kernel = SimulationKernel.create(dhcpLab(pool('LAN', '192.168.1', { range: { start: '192.168.1.100', end: '192.168.1.200' } })), serviceTestLayers)
    kernel.runUntilDone(kernel.inject({ kind: 'dhcpRenew', deviceId: 'pc' }))
    expect(kernel.runtime('pc')?.services.dhcpClients).toHaveLength(1)
    expect(kernel.runtime('r')?.services.dhcpBindings).toHaveLength(1)
    const edited = editAddress(kernel.network(), 'pc', 'eth0', { addressing: 'static' })
    const noPools = {
      ...edited,
      devices: edited.devices.map((device) => (device.id === 'r' ? { ...device, services: { dhcp: { enabled: true, pools: [], excludedRanges: [] } } } : device)),
    }
    kernel.reconfigure(noPools)
    expect(kernel.runtime('pc')?.services.dhcpClients).toEqual([])
    expect(kernel.runtime('r')?.services.dhcpBindings).toEqual([])
  })
})
