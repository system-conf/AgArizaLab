// Test-only: small doubles of the link and service layers so the network layer can be tested before S1 /
// S3 exist (docs/SIMULATION.md §11, interim agreement). The stub link layer is NOT a model of layer 2:
// bridges flood every frame inside its VLAN (VlanRules), endpoints filter by MAC, and next hops are
// resolved at once with the rule engine's SegmentFinder (test code only; the layers never import it).
// Unresolved next hops wait 3000 ms like S1's three ARP attempts, then go to `onUndeliverable`.
import type { Device, NetworkState, Port, SwitchedPort } from '../../domain'
import { type L3Interface, L3Interfaces } from '../../engine/L3Interfaces'
import { SegmentFinder } from '../../engine/SegmentFinder'
import { VlanRules } from '../../engine/VlanRules'
import {
  BROADCAST_MAC,
  type DeviceContext,
  DeviceProfiles,
  type EthernetFrame,
  type FrameArrival,
  type IcmpErrorReport,
  type Ipv4Packet,
  type Ipv4SendResult,
  type LinkLayer,
  type LinkSend,
  type LinkTimer,
  type ServiceLayer,
  type SimLayers,
  type SimRequest,
  SIM_TIMING,
  type TransportDelivery,
  type WireFrame,
} from '../contract'
import { SimulationKernel } from '../core'
import { networkLayer } from './index'

const segments = new SegmentFinder()
const ARP_GIVE_UP_MS = SIM_TIMING.arpRetryMs * SIM_TIMING.arpAttempts

interface Egress {
  readonly mac: string
  readonly ports: ReadonlyArray<{ readonly port: Port; readonly tag: number | null }>
}

class StubLinkLayer implements LinkLayer {
  private readonly conflicts: ReadonlySet<string>

  /** `conflicts`: 'deviceId/interfaceId' keys whose address S1 would mark duplicate. */
  constructor(conflicts: ReadonlySet<string>) {
    this.conflicts = conflicts
  }

  onStart(): void {}
  onChange(): void {}

  onRequest(ctx: DeviceContext, requestId: string): void {
    ctx.report(requestId, { kind: 'cleared', entries: 0 }, true)
  }

  interfaceReady(ctx: DeviceContext, interfaceId: string): Ipv4SendResult {
    if (this.conflicts.has(`${ctx.device.id}/${interfaceId}`)) return { ok: false, reason: 'ipConflict' }
    return { ok: true, src: L3Interfaces.find(ctx.device, interfaceId)?.address ?? '', interfaceId }
  }

  send(ctx: DeviceContext, request: LinkSend): void {
    const { event, packet } = request
    const egress = StubLinkLayer.egress(ctx.device, request.interfaceId)
    const destination = request.linkDestination
    const dst =
      destination?.kind === 'broadcast' ? BROADCAST_MAC : destination?.kind === 'mac' ? destination.mac : StubLinkLayer.resolve(ctx, request)
    if (dst === null || !egress) {
      event.setOutbound(packet)
      event.conclude('buffered', 2)
      const pending = { interfaceId: request.interfaceId, nextHopIp: request.nextHopIp, packet, ids: request.ids, bufferedEventId: event.id, queuedAt: ctx.now }
      const entry = request.ingressInterfaceId === undefined ? pending : { ...pending, ingressInterfaceId: request.ingressInterfaceId }
      ctx.updateRuntime((runtime) => ({ ...runtime, link: { ...runtime.link, pending: [...runtime.link.pending, entry] } }))
      ctx.schedule(ARP_GIVE_UP_MS, { layer: 'link', kind: 'arpRetry', interfaceId: request.interfaceId, ip: request.nextHopIp })
      return
    }
    let sent = false
    for (const { port, tag } of egress.ports) {
      const frame: WireFrame =
        port.medium === 'serial'
          ? { kind: 'hdlc', payload: packet }
          : { kind: 'ethernet', src: egress.mac, dst, ...(tag === null ? {} : { tag: { vid: tag, pcp: 0 } }), payload: packet }
      sent = event.transmit({ portId: port.id }, frame, request.ids.frameId) || sent
    }
    if (!sent) event.conclude('dropped', 1, 'linkDown')
    else event.conclude(event === ctx.arrival ? 'forwarded' : 'created', 3)
  }

  /** The stub's "ARP" gave up: every packet waiting for that address is dropped and reported. */
  onTimer(ctx: DeviceContext, timer: LinkTimer): void {
    const due = ctx.runtime.link.pending.filter(
      (entry) => entry.interfaceId === timer.interfaceId && entry.nextHopIp === timer.ip && entry.queuedAt + ARP_GIVE_UP_MS <= ctx.now,
    )
    if (due.length === 0) return
    ctx.updateRuntime((runtime) => ({ ...runtime, link: { ...runtime.link, pending: runtime.link.pending.filter((entry) => !due.includes(entry)) } }))
    for (const entry of due) {
      const dropped = ctx.openEvent({ flowId: entry.ids.flowId, ids: entry.ids, causeEventId: entry.bufferedEventId })
      dropped.setOutbound(entry.packet)
      dropped.conclude('dropped', 2, 'arpTimeout')
      ctx.layers.network.onUndeliverable(ctx, {
        interfaceId: entry.interfaceId,
        nextHopIp: entry.nextHopIp,
        packet: entry.packet,
        ids: entry.ids,
        reason: 'arpTimeout',
        droppedEventId: dropped.id,
        ...(entry.ingressInterfaceId === undefined ? {} : { ingressInterfaceId: entry.ingressInterfaceId }),
      })
    }
  }

  onFrame(ctx: DeviceContext, arrival: FrameArrival): void {
    const event = ctx.arrival
    if (!event) throw new Error('arrival without builder')
    const port = ctx.device.ports.find((candidate) => candidate.id === arrival.portId)
    const frame = arrival.frame
    const packet = frame.payload.kind === 'ipv4' ? frame.payload : null
    if (!port || !packet) return event.conclude('dropped', 2, 'unsupported')
    const linkSourceMac = frame.kind === 'ethernet' ? frame.src : null
    const linkBroadcast = frame.kind === 'ethernet' && frame.dst === BROADCAST_MAC
    const deliver = (interfaceId: string) =>
      ctx.layers.network.onPacket(ctx, { interfaceId, inPortId: port.id, packet, ids: arrival.ids, linkSourceMac, linkBroadcast, event })
    if (DeviceProfiles.of(ctx.device).isp) {
      const handoff = ctx.device.internet?.handoffs.find((candidate) => candidate.portId === port.id)
      if (handoff?.serviceUp === false) return event.conclude('dropped', 2, 'ispServiceDown')
      return deliver(port.id)
    }
    if (port.role === 'switched' && frame.kind === 'ethernet') return StubLinkLayer.bridge(ctx, port, frame, packet, deliver)
    const accepted = frame.kind === 'hdlc' || frame.dst === BROADCAST_MAC || frame.dst === port.mac
    if (!accepted) return event.conclude('dropped', 2, 'notForThisInterface')
    if (port.role === 'host') return deliver(port.id)
    if (port.role !== 'routed') return event.conclude('dropped', 2, 'unsupported')
    const tag = frame.kind === 'ethernet' ? (frame.tag?.vid ?? null) : null
    const sub = port.subInterfaces.find((candidate) => (tag === null ? candidate.native === true : candidate.vlan === tag))
    if (tag !== null && !sub) return event.conclude('dropped', 2, 'noSubInterface')
    deliver(sub ? sub.id : port.id)
  }

  /** Floods in the frame's VLAN; frames for (or broadcast to) the VLAN's SVI go up to layer 3. */
  private static bridge(ctx: DeviceContext, inPort: SwitchedPort, frame: EthernetFrame, packet: Ipv4Packet, deliver: (interfaceId: string) => void): void {
    const event = ctx.arrival
    if (!event) return
    const vlan = VlanRules.ingress(ctx.device, inPort, frame.tag?.vid ?? null)
    if (vlan === null) return event.conclude('dropped', 2, 'vlanNotAllowed')
    const svi = L3Interfaces.find(ctx.device, `Vlan${vlan}`)
    if (svi && frame.dst === ctx.device.baseMac) return deliver(svi.id)
    let flooded = false
    for (const port of ctx.device.ports) {
      if (port.id === inPort.id || port.role !== 'switched') continue
      const tag = VlanRules.egress(ctx.device, port, vlan)
      if (tag === undefined) continue
      const out: EthernetFrame = { kind: 'ethernet', src: frame.src, dst: frame.dst, ...(tag === null ? {} : { tag: { vid: tag, pcp: 0 } }), payload: packet }
      flooded = event.transmit({ portId: port.id }, out) || flooded
    }
    event.conclude(flooded ? 'flooded' : 'filtered', 2, flooded ? undefined : 'sameSegment')
    if (svi && frame.dst === BROADCAST_MAC) deliver(svi.id)
  }

  private static egress(device: Device, interfaceId: string): Egress | null {
    const iface = L3Interfaces.find(device, interfaceId)
    if (!iface) {
      const port = device.ports.find((candidate) => candidate.id === interfaceId)
      return port?.mac ? { mac: port.mac, ports: [{ port, tag: null }] } : null
    }
    if (iface.kind === 'svi') {
      const ports = device.ports.flatMap((port) => {
        if (port.role !== 'switched') return []
        const tag = VlanRules.egress(device, port, iface.vlan ?? 0)
        return tag === undefined ? [] : [{ port, tag }]
      })
      return { mac: device.baseMac, ports }
    }
    const port = device.ports.find((candidate) => candidate.id === iface.portId)
    if (!port) return null
    const tag = iface.kind === 'subInterface' && !iface.native ? (iface.vlan ?? null) : null
    return { mac: port.mac ?? device.baseMac, ports: [{ port, tag }] }
  }

  /** MAC of the next hop: the cloud's port (proxy ARP) or the interface SegmentFinder says answers ARP. */
  private static resolve(ctx: DeviceContext, request: LinkSend): string | null {
    const iface = L3Interfaces.find(ctx.device, request.interfaceId)
    if (!iface) return null
    if (iface.portId !== undefined) {
      for (const link of ctx.topology.linksAt(ctx.device.id, iface.portId)) {
        const far = ctx.topology.farEnd(link, ctx.device.id, iface.portId)
        if (far.device?.kind === 'internet' && ctx.topology.isUp(link)) return far.port?.mac ?? null
      }
    }
    const target = segments.findAddress(ctx.network, segments.segment(ctx.network, iface), request.nextHopIp)
    return target ? StubLinkLayer.macOf(ctx, target) : null
  }

  private static macOf(ctx: DeviceContext, target: L3Interface): string | null {
    const device = ctx.topology.find(target.deviceId)
    if (!device) return null
    if (target.kind === 'svi') return device.baseMac
    return device.ports.find((port) => port.id === target.portId)?.mac ?? null
  }
}

/** What the stub services saw. */
export interface ServiceLog {
  readonly datagrams: Array<{ deviceId: string; packet: Ipv4Packet }>
  readonly icmpErrors: Array<{ deviceId: string; reporterIp: string; local: boolean; type: string; code: string }>
}

export interface Listener {
  readonly deviceId: string
  readonly protocol: 'udp' | 'tcp'
  readonly port: number
}

/** Listens where told; `dnsQuery` sends one UDP datagram to servers[0]:53, `httpGet` one TCP SYN to :80. */
class StubServiceLayer implements ServiceLayer {
  readonly log: ServiceLog = { datagrams: [], icmpErrors: [] }
  private readonly listeners: readonly Listener[]

  constructor(listeners: readonly Listener[]) {
    this.listeners = listeners
  }

  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}

  listens(ctx: DeviceContext, protocol: 'udp' | 'tcp', _dstIp: string, dstPort: number): boolean {
    return this.listeners.some((entry) => entry.deviceId === ctx.device.id && entry.protocol === protocol && entry.port === dstPort)
  }

  onDatagram(ctx: DeviceContext, delivery: TransportDelivery): void {
    this.log.datagrams.push({ deviceId: ctx.device.id, packet: delivery.packet })
    delivery.event.conclude('delivered', 7)
  }

  onIcmpError(ctx: DeviceContext, report: IcmpErrorReport): void {
    const { error } = report
    this.log.icmpErrors.push({ deviceId: ctx.device.id, reporterIp: report.reporterIp, local: report.local, type: error.type, code: error.code })
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    const ids = ctx.newPdu(requestId)
    if (request.kind === 'dnsQuery') {
      const dst = request.servers?.[0] ?? ''
      ctx.layers.network.send(ctx, { ids, dst, payload: { kind: 'udp', srcPort: 49152, dstPort: 53, payload: { kind: 'data', bytes: 20 } } })
    } else if (request.kind === 'httpGet') {
      ctx.layers.network.send(ctx, { ids, dst: request.serverIp, payload: { kind: 'tcp', srcPort: 49152, dstPort: 80, flags: ['syn'], seq: 100, payload: null } })
    }
    ctx.report(requestId, { kind: 'cleared', entries: 0 }, true)
  }

  applyEffect(state: NetworkState): NetworkState {
    return state
  }
}

export interface L3TestOptions {
  readonly conflicts?: readonly string[]
  readonly listeners?: readonly Listener[]
}

/** The real network layer between the two stubs. */
export function l3TestLayers(options: L3TestOptions = {}): { layers: SimLayers; services: ServiceLog } {
  const services = new StubServiceLayer(options.listeners ?? [])
  return { layers: { link: new StubLinkLayer(new Set(options.conflicts ?? [])), network: networkLayer, services }, services: services.log }
}

export function l3Engine(state: NetworkState, options: L3TestOptions = {}): { engine: SimulationKernel; services: ServiceLog } {
  const { layers, services } = l3TestLayers(options)
  return { engine: SimulationKernel.create(state, layers), services }
}
