// Test-only (O3): the faults a generated lab may get (cable unplugged, port shut, power off, IP conflict,
// wrong gateway / mask, provider outage, network address as host address, access VLAN changed). Every
// fault keeps the lab valid (StateInvariants): no MAC, id or VLAN range is touched.
import type { Device, NetworkState, Port } from '../../domain'
import type { FaultPlan } from './labPlan'
import { LabPorts } from './LabPorts'

const WRONG_MASKS = ['255.255.255.128', '255.255.0.0', '255.255.255.252']

function pick<Item>(items: readonly Item[], index: number): Item | undefined {
  return items.length === 0 ? undefined : items[index % items.length]
}

function firstNic(device: Device): Port | undefined {
  return device.ports.find((port) => port.role === 'host' && port.l3.ipv4.address !== '')
}

export class LabFaults {
  static apply(state: NetworkState, faults: readonly FaultPlan[]): NetworkState {
    return faults.reduce((current, fault) => LabFaults.applyOne(current, fault), state)
  }

  private static applyOne(state: NetworkState, fault: FaultPlan): NetworkState {
    const hosts = state.devices.filter((device) => device.host !== undefined && firstNic(device) !== undefined)
    switch (fault.kind) {
      case 'unplug': {
        const link = pick(state.links, fault.pick)
        if (!link) return state
        return { ...state, links: state.links.map((candidate) => (candidate === link ? { ...candidate, connected: false } : candidate)) }
      }
      case 'shutdown': {
        const link = pick(state.links, fault.pick)
        const end = link && (fault.other % 2 === 0 ? link.a : link.b)
        if (!end) return state
        return LabFaults.edit(state, end.deviceId, (device) => LabPorts.editPort(device, end.portId, (port) => ({ ...port, adminUp: false })))
      }
      case 'powerOff': {
        const device = pick(state.devices, fault.pick)
        return device ? LabFaults.edit(state, device.id, (target) => ({ ...target, powered: false })) : state
      }
      case 'ipConflict': {
        const host = pick(hosts, fault.pick)
        const other = pick(hosts, fault.other)
        const source = other && firstNic(other)
        if (!host || !other || host === other || source?.role !== 'host') return state
        return LabFaults.editNic(state, host, (address, mask) => [source.l3.ipv4.address || address, source.l3.ipv4.mask || mask])
      }
      case 'wrongGateway': {
        const host = pick(hosts, fault.pick)
        const choices = ['', '10.250.0.1', '10.1.1.254', 'not.an.ip']
        const gateway = choices[fault.other % choices.length] ?? ''
        if (!host?.host) return state
        const settings = host.host
        return LabFaults.edit(state, host.id, (device) => ({ ...device, host: { ...settings, defaultGateway: gateway } }))
      }
      case 'wrongMask': {
        const host = pick(hosts, fault.pick)
        return host ? LabFaults.editNic(state, host, (address) => [address, WRONG_MASKS[fault.other % WRONG_MASKS.length] ?? '']) : state
      }
      case 'serviceDown':
        return LabFaults.edit(state, 'internet', (cloud) => ({ ...cloud, internet: { handoffs: [{ portId: 'eth0', serviceUp: false }] } }))
      case 'invalidHostAddress': {
        const host = pick(hosts, fault.pick)
        return host ? LabFaults.editNic(state, host, (address, mask) => [address.replace(/\.\d+$/, fault.other % 2 === 0 ? '.0' : '.255'), mask]) : state
      }
      case 'vlanChange':
        return LabFaults.changeAccessVlan(state, fault)
    }
  }

  private static changeAccessVlan(state: NetworkState, fault: FaultPlan): NetworkState {
    const ports = state.devices.flatMap((device) =>
      device.ports.filter((port) => port.role === 'switched' && port.l2.mode === 'access').map((port) => ({ device, port })),
    )
    const chosen = pick(ports, fault.pick)
    if (!chosen) return state
    const vlans = [1, 10, 20, 30]
    const vlan = vlans[fault.other % vlans.length] ?? 1
    return LabFaults.edit(state, chosen.device.id, (device) =>
      LabPorts.editPort(device, chosen.port.id, (port) => (port.role === 'switched' ? { ...port, l2: { ...port.l2, accessVlan: vlan } } : port)),
    )
  }

  private static editNic(state: NetworkState, host: Device, change: (address: string, mask: string) => [string, string]): NetworkState {
    const nic = firstNic(host)
    if (nic?.role !== 'host') return state
    const [address, mask] = change(nic.l3.ipv4.address, nic.l3.ipv4.mask)
    return LabFaults.edit(state, host.id, (device) =>
      LabPorts.editPort(device, nic.id, (port) => (port.role === 'host' ? { ...port, l3: { ...port.l3, ipv4: { addressing: 'static', address, mask } } } : port)),
    )
  }

  private static edit(state: NetworkState, deviceId: string, change: (device: Device) => Device): NetworkState {
    if (!state.devices.some((device) => device.id === deviceId)) return state
    return { ...state, devices: state.devices.map((device) => (device.id === deviceId ? change(device) : device)) }
  }
}
