// Test-only (O3): turns a LabPlan into a valid NetworkState built from catalog models (PortFactory).
// Addressing: LAN of router r (1-based) = 10.r.<vlanIndex + 1>.0/24, gateway .1; router chain transit
// r ↔ r+1 = 172.31.r.0/24 (Gi0/3 .1 ↔ Gi0/2 .2); router ↔ L3 switch = 172.30.r.0/24; WAN = router1
// Gi0/1 ↔ internet eth0 (no address, default route out of Gi0/1). At most MAX_DEVICES devices.
import { CableRules, type Device, type Link, type NetworkState, type Port, type StaticRoute } from '../../domain'
import { findDeviceModel, PortFactory, type BaseMacSource } from '../../catalog'
import type { LabPlan, LanPlan, RouterPlan } from './labPlan'
import { LabHosts, type BuiltHost } from './LabHosts'
import { LAN_MASK as MASK, gatewayIp, routerId } from './labAddresses'
import { LabPorts } from './LabPorts'

export const MAX_DEVICES = 12

/** Unique, readable base MACs (00:A0:00:00:00:01, …): derived port MACs never collide. */
class CounterMacSource implements BaseMacSource {
  private count = 0

  next(): string {
    this.count += 1
    const hex = this.count.toString(16).toUpperCase().padStart(4, '0')
    return `00:A0:00:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}`
  }
}

/** Planned cable before the cable type is chosen. */
export interface PlannedLink {
  a: [string, string]
  b: [string, string]
  ssid?: string
}

export class LabBuilder {
  readonly devices: Device[] = []
  readonly links: PlannedLink[] = []
  readonly hosts: BuiltHost[] = []
  private readonly factory = new PortFactory(new CounterMacSource())
  private readonly plan: LabPlan

  private constructor(plan: LabPlan) {
    this.plan = plan
  }

  static build(plan: LabPlan): NetworkState {
    const builder = new LabBuilder(plan)
    builder.buildAll()
    return builder.finish()
  }

  create(modelId: string, id: string): Device {
    const model = findDeviceModel(modelId)
    if (!model) throw new Error(`unknown catalog model ${modelId}`)
    const device = this.factory.createDevice(model, id, id)
    this.devices.push(device)
    return device
  }

  replace(device: Device): void {
    const index = this.devices.findIndex((candidate) => candidate.id === device.id)
    this.devices[index] = device
  }

  device(id: string): Device {
    const device = this.devices.find((candidate) => candidate.id === id)
    if (!device) throw new Error(`no device ${id}`)
    return device
  }

  edit(id: string, change: (device: Device) => Device): void {
    this.replace(change(this.device(id)))
  }

  editPort(id: string, portId: string, change: (port: Port) => Port): void {
    this.edit(id, (device) => LabPorts.editPort(device, portId, change))
  }

  link(a: [string, string], b: [string, string], ssid?: string): void {
    this.links.push(ssid === undefined ? { a, b } : { a, b, ssid })
  }

  room(): number {
    return MAX_DEVICES - this.devices.length
  }

  private buildAll(): void {
    if (this.plan.internet) this.create('internetCloud', 'internet')
    this.plan.routers.forEach((_router, index) => this.create('router4Port', routerId(index)))
    this.plan.routers.forEach((router, index) => this.buildRouter(router, index))
    this.plan.routers.forEach((router, index) => this.buildLan(router.lan, index))
    new LabHosts(this).finishHosts(this.plan)
  }

  private buildRouter(plan: RouterPlan, index: number): void {
    const id = routerId(index)
    const count = this.plan.routers.length
    if (index > 0) this.editPort(id, 'Gi0/2', LabPorts.routed(`172.31.${index - 1}.2`, MASK))
    if (index < count - 1) {
      this.editPort(id, 'Gi0/3', LabPorts.routed(`172.31.${index}.1`, MASK))
      this.link([id, 'Gi0/3'], [routerId(index + 1), 'Gi0/2'])
    }
    if (index === 0 && this.plan.internet) {
      this.editPort(id, 'Gi0/1', LabPorts.routed('', ''))
      this.link([id, 'Gi0/1'], ['internet', 'eth0'])
    }
    this.edit(id, (device) => ({ ...device, routing: { ipRouting: true, staticRoutes: this.routes(plan, index) } }))
    if (plan.dns) {
      const forwarders =
        plan.dns.forwarders === 'public' ? ['8.8.8.8'] : plan.dns.forwarders === 'previousRouter' ? [gatewayIp((index + count - 1) % count, 0)] : []
      const records = plan.dns.records ? [{ type: 'A' as const, name: 'intranet.local', address: gatewayIp(index, 0) }] : []
      this.edit(id, (device) => ({ ...device, services: { ...device.services, dns: { enabled: true, forwarders, records } } }))
    }
  }

  /** Static routes of router `index` (see RouteMode). */
  private routes(plan: RouterPlan, index: number): StaticRoute[] {
    const count = this.plan.routers.length
    const toward = (other: number): string => (other < index ? `172.31.${index - 1}.1` : `172.31.${index}.2`)
    const exitToward = (other: number): string => (other < index ? 'Gi0/2' : 'Gi0/3')
    const routes: StaticRoute[] = []
    const route = (prefix: string, mask: string, via: { nextHop: string } | { exitInterfaceId: string }, adminDistance = 1): void => {
      routes.push({ prefix, mask, adminDistance, ...via })
    }
    const l3Lan = plan.lan.access === 'l3Switch'
    if (l3Lan) route(`10.${index + 1}.0.0`, '255.255.0.0', { nextHop: `172.30.${index}.2` })
    // Remote networks: [prefix, mask, a router on that side]: other LANs, their L3-switch links, other transits.
    const remote: Array<[string, string, number]> = []
    for (let other = 0; other < count; other += 1) {
      if (other === index) continue
      remote.push([`10.${other + 1}.0.0`, '255.255.0.0', other], [`172.30.${other}.0`, MASK, other])
      if (other < count - 1 && other !== index - 1 && other !== index) remote.push([`172.31.${other}.0`, MASK, other])
    }
    for (const [prefix, mask, other] of plan.routes === 'missing' ? [] : remote) {
      if (plan.routes === 'wrongNextHop') route(prefix, mask, { nextHop: other < index ? `172.31.${index - 1}.9` : `172.31.${index}.9` })
      else if (plan.routes === 'exitInterface') route(prefix, mask, { exitInterfaceId: exitToward(other) })
      else route(prefix, mask, { nextHop: toward(other) })
      if (plan.routes === 'floating') route(prefix, mask, { nextHop: `172.31.${index}.9` }, 200)
    }
    const defaultRoute = this.defaultRoute(plan, index)
    if (defaultRoute) routes.push(defaultRoute)
    if (plan.routes === 'floating') route('0.0.0.0', '0.0.0.0', { nextHop: index > 0 ? `172.31.${index - 1}.9` : gatewayIp(index, 0) }, 250)
    if (plan.routes === 'loop') route('10.200.0.0', '255.255.0.0', { nextHop: index < count - 1 ? `172.31.${index}.2` : l3Lan ? `172.30.${index}.2` : toward(0) })
    return routes
  }

  private defaultRoute(plan: RouterPlan, index: number): StaticRoute | null {
    const count = this.plan.routers.length
    if (plan.routes === 'loop' && index < count - 1) return { prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, nextHop: `172.31.${index}.2` }
    if (index > 0) {
      const nextHop = plan.routes === 'wrongNextHop' ? `172.31.${index - 1}.9` : `172.31.${index - 1}.1`
      return plan.routes === 'exitInterface'
        ? { prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, exitInterfaceId: 'Gi0/2' }
        : { prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, nextHop }
    }
    if (!this.plan.internet) return null
    return { prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, exitInterfaceId: 'Gi0/1' }
  }

  private buildLan(plan: LanPlan, index: number): void {
    new LabHosts(this).buildLan(plan, index)
  }

  private finish(): NetworkState {
    const rules = new CableRules()
    const partial: NetworkState = { devices: this.devices, links: [] }
    const links: Link[] = this.links.map((planned, number) => {
      const ends = {
        id: `link${number + 1}`,
        a: { deviceId: planned.a[0], portId: planned.a[1] },
        b: { deviceId: planned.b[0], portId: planned.b[1] },
        connected: true,
      }
      if (planned.ssid !== undefined) return { ...ends, cable: 'wireless', ssid: planned.ssid }
      const cable = rules.autoCable(partial, ends.a, ends.b)
      if (cable !== 'copperStraight' && cable !== 'copperCross' && cable !== 'fiber') {
        throw new Error(`LabBuilder: no plain cable for ${ends.id} (${cable})`)
      }
      return { ...ends, cable }
    })
    return { devices: this.devices, links }
  }
}
