// The device plug-in contract (docs/SIMULATION.md §6): the kernel (src/sim/core) runs tasks and hands
// each one to the layer that owns it, through a DeviceContext bound to one device. The three layers are
// stateless singletons that branch on the device's configuration (DeviceProfile) and keep everything
// they learn in their DeviceRuntime slice. They call each other only through `ctx.layers`.
import type { Device, NetworkState } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import type { Topology } from '../../net/Topology'
import type { IcmpError, Ipv4Packet, Ipv4Payload, Pdu, WireFrame } from './Pdu'
import type { LinkTimer } from './LinkLayerState'
import type { NetworkTimer } from './NetworkLayerState'
import type { ServiceTimer } from './ServiceLayerState'
import type { RequestResult, SimRequest, StateEffect } from './Requests'
import type { DeviceRuntime, SimTimer } from './Runtime'
import type { NoteDirection, OsiLayer, PduIds, ReasonedAction, SimAction, SimNote, SimProtocol } from './SimEvent'
import type { SimReason } from './SimReason'

// ---------------------------------------------------------------- events under construction

/** Where a frame leaves: the port, and the link when the port holds several (radio ports). */
export interface TransmitTarget {
  readonly portId: string
  readonly linkId?: string
}

/** Collects one SimEvent while a task runs; the kernel stamps id / time / seq and commits it. */
export interface EventBuilder {
  /** The event id (allocated when the builder was opened; use it as `causeEventId`). */
  readonly id: number
  readonly flowId: string
  readonly pduId: string | null
  readonly frameId: string | null
  note(layer: OsiLayer, direction: NoteDirection, message: LocalizedMessage): void
  /**
   * Puts a frame on the wire (layer 1). Adds the port to `outPortIds` and the first frame as `outbound`.
   * `frameId` defaults to the builder's. Returns false (and adds the `simulation:notes.l1.linkDown` note)
   * when the port has no link that carries traffic; nothing is sent then.
   */
  transmit(target: TransmitTarget, frame: WireFrame, frameId?: string): boolean
  /** Outbound PDU of an event that sends nothing (a buffered packet, a refused one). */
  setOutbound(pdu: Pdu): void
  /** Required exactly once per builder (the last call wins; an unconcluded builder is a programmer error). */
  conclude(action: Exclude<SimAction, ReasonedAction>, layer: OsiLayer, reason?: SimReason): void
  conclude(action: ReasonedAction, layer: OsiLayer, reason: SimReason): void
}

/** Start values of an event that is not the task's arrival. */
export interface EventDraft {
  readonly flowId: string
  /** Absent = PDU-less event (timeout, failure before a packet exists). */
  readonly ids?: PduIds
  readonly protocol?: SimProtocol
  readonly causeEventId?: number
}

// ---------------------------------------------------------------- the context

/** A device's view of the simulation while one task runs. Valid only during that call. */
export interface DeviceContext {
  /** Virtual ms of the task. */
  readonly now: number
  readonly device: Device
  /** The whole configuration (read-only), e.g. to look at the far end of a link. */
  readonly network: NetworkState
  /** Cached index over `network` (links per port, far ends, Topology.isUp). */
  readonly topology: Topology
  readonly runtime: DeviceRuntime
  readonly layers: SimLayers
  /** Replaces this device's runtime (only this device: other devices are reached through frames). */
  updateRuntime(change: (runtime: DeviceRuntime) => DeviceRuntime): void
  /** Seeded uniform number in [0, 1); the only randomness allowed (transaction ids, DNS ids, TCP ISN). */
  random(): number
  /** Builder of the task's arriving frame; null for timers, requests and lifecycle hooks. */
  readonly arrival: EventBuilder | null
  /** A new event at this device (a created PDU, a released packet, a timeout). */
  openEvent(draft: EventDraft): EventBuilder
  /** Ids for a PDU this device creates; `flowId` of the request / packet that caused it. */
  newPdu(flowId: string): PduIds
  /** A new frame id for the same PDU (router re-encapsulation, a buffered packet sent later). */
  newFrameId(): string
  /** Queues a timer for this device `delayMs` (>= 0) from now. Timers are never cancelled. */
  schedule(delayMs: number, timer: SimTimer): void
  /** Writes a request's (partial) result; `done` finishes it. */
  report(requestId: string, result: RequestResult, done: boolean): void
  /** A configuration change (DHCP lease); applied after the task through ServiceLayer.applyEffect. */
  applyEffect(effect: StateEffect): void
}

// ---------------------------------------------------------------- data handed between layers

/** A frame that arrived on a physical port of the device (the kernel checked that the link is up). */
export interface FrameArrival {
  readonly portId: string
  readonly linkId: string
  readonly fromDeviceId: string
  readonly fromPortId: string
  readonly frame: WireFrame
  readonly ids: PduIds
}

/** How the link layer addresses a frame without ARP. */
export type LinkDestination = { readonly kind: 'broadcast' } | { readonly kind: 'mac'; readonly mac: string }

/** Network → link: send an IPv4 packet out of an L3 interface toward an on-link next hop. */
export interface LinkSend {
  /** Port id, sub-interface id, 'Vlan<n>' (cloud: the handoff port id). */
  readonly interfaceId: string
  /** Address to resolve with ARP; ignored with `linkDestination`. */
  readonly nextHopIp: string
  readonly packet: Ipv4Packet
  readonly ids: PduIds
  /** Skip ARP: broadcast (DHCP, limited broadcast) or a known MAC (DHCP reply, the cloud's return path). */
  readonly linkDestination?: LinkDestination
  /** Event that carries the packet so far (the routing decision); the link layer concludes it. */
  readonly event: EventBuilder
  /** Forwarded packets: the interface it arrived on (an ICMP error after a failed ARP is sourced from it). */
  readonly ingressInterfaceId?: string
}

/** Link → network: an IPv4 packet accepted on an L3 interface. */
export interface Ipv4Delivery {
  readonly interfaceId: string
  readonly inPortId: string
  readonly packet: Ipv4Packet
  readonly ids: PduIds
  /** Source MAC of the frame; null on serial links. */
  readonly linkSourceMac: string | null
  /** Arrived as a layer-2 broadcast. */
  readonly linkBroadcast: boolean
  /** The arrival's builder; the network layer (or the services it passes to) concludes it. */
  readonly event: EventBuilder
}

/** Link → network: a packet could not be sent (ARP failed); the link layer already logged the drop. */
export interface Undeliverable {
  readonly interfaceId: string
  readonly nextHopIp: string
  readonly packet: Ipv4Packet
  readonly ids: PduIds
  readonly reason: Extract<SimReason, 'arpTimeout' | 'linkDown'>
  /** The 'dropped' event of the packet (cause of an ICMP error). */
  readonly droppedEventId: number
  /** Copied from LinkSend. */
  readonly ingressInterfaceId?: string
}

/** Services / ICMP clients → network: originate an IPv4 packet. */
export interface Ipv4Send {
  readonly ids: PduIds
  readonly dst: string
  /** Absent = address of the exit interface (routers without one: first addressed up interface). */
  readonly src?: string
  /** Absent = SIM_TTL.host on end devices and switches, SIM_TTL.router on routers. */
  readonly ttl?: number
  readonly payload: Ipv4Payload
  /** Send on this interface without a route lookup (DHCP client / server). */
  readonly egressInterfaceId?: string
  readonly linkDestination?: LinkDestination
  /** Event of the cause (a query being answered); the new PDU's 'created' event points back to it. */
  readonly causeEventId?: number
  /** Explanation lines of the sender (e.g. a service's layer-7 notes), added to the 'created' event as out-notes. */
  readonly notes?: readonly SimNote[]
}

/** Synchronous answer of NetworkLayer.send: refused locally (logged as a 'dropped' event) or on its way. */
export type Ipv4SendResult =
  | { readonly ok: true; readonly src: string; readonly interfaceId: string }
  | { readonly ok: false; readonly reason: SimReason }

/** Network → services: a UDP / TCP packet for a local listener. */
export interface TransportDelivery {
  readonly interfaceId: string
  readonly packet: Ipv4Packet
  readonly ids: PduIds
  readonly linkSourceMac: string | null
  readonly event: EventBuilder
}

/**
 * Network → services: an ICMP error about a UDP / TCP packet this device sent, received from
 * `reporterIp`; or `local: true` when this device's own ARP failed (reporterIp = own address).
 */
export interface IcmpErrorReport {
  readonly reporterIp: string
  readonly error: IcmpError
  readonly local: boolean
  readonly event: EventBuilder
}

// ---------------------------------------------------------------- lifecycle

/** Why a device's layers are told about a change (computed by the kernel on reconfigure / effects). */
export interface DeviceChange {
  readonly previous: Device
  /** The device's own configuration differs (layers diff `previous` against `ctx.device`). */
  readonly configChanged: boolean
  /** Ports whose link stopped / started carrying traffic (Topology.isUp), e.g. the far end was switched off. */
  readonly portsDown: readonly string[]
  readonly portsUp: readonly string[]
}

/** Hooks every layer has. Hooks run inside a task scope: they may send, schedule and log events. */
export interface LayerLifecycle {
  /** The device starts (engine created, device added or powered on) with an empty runtime slice. */
  onStart(ctx: DeviceContext): void
  /** Configuration or link status changed (power-off and removal reset the runtime instead: no hook). */
  onChange(ctx: DeviceContext, change: DeviceChange): void
}

// ---------------------------------------------------------------- the three layers

/** S1 (src/sim/l2): hubs, bridges, NIC filtering, 802.1Q, ARP, duplicate address detection, the cloud's ports. */
export interface LinkLayer extends LayerLifecycle {
  /** Every frame arriving at a device goes here first. */
  onFrame(ctx: DeviceContext, arrival: FrameArrival): void
  /** Resolve (ARP, buffer while waiting), encapsulate (tag for sub-interfaces / SVI bridging) and transmit. */
  send(ctx: DeviceContext, request: LinkSend): void
  onTimer(ctx: DeviceContext, timer: LinkTimer): void
  /** `clearTable` for 'arp' and 'mac'. */
  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void
  /** Can the interface send now (link up, not a duplicate address)? Used by the network layer before routing. */
  interfaceReady(ctx: DeviceContext, interfaceId: string): Ipv4SendResult
  /**
   * Called per running device after `SimulationKernel.create` ran the start-up traffic to idle (`settle`):
   * the link layer forgets what devices learned from it (coordinator decision 3) and keeps the
   * duplicate-address results.
   */
  onSettled?(ctx: DeviceContext): void
}

/** S2 (src/sim/l3): IPv4 for hosts, routers, L3 switches and the cloud; ICMP; transport demux; ping / tracert. */
export interface NetworkLayer extends LayerLifecycle {
  onPacket(ctx: DeviceContext, delivery: Ipv4Delivery): void
  /** Originate a packet (services, ICMP replies / errors, clients). Logs a 'created' or 'dropped' event. */
  send(ctx: DeviceContext, request: Ipv4Send): Ipv4SendResult
  onUndeliverable(ctx: DeviceContext, failure: Undeliverable): void
  onTimer(ctx: DeviceContext, timer: NetworkTimer): void
  /** 'ping' and 'tracert'. */
  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void
}

/** S3 (src/sim/services): DHCP server / client / relay, DNS server / forwarder / client, HTTP. */
export interface ServiceLayer extends LayerLifecycle {
  /** Does a local service listen on this destination address and port? (No → ICMP port unreachable / RST.) */
  listens(ctx: DeviceContext, protocol: 'udp' | 'tcp', dstIp: string, dstPort: number): boolean
  onDatagram(ctx: DeviceContext, delivery: TransportDelivery): void
  onIcmpError(ctx: DeviceContext, report: IcmpErrorReport): void
  onTimer(ctx: DeviceContext, timer: ServiceTimer): void
  /** 'dhcpRenew', 'dhcpRelease', 'dnsQuery', 'httpGet', and `clearTable` for 'dnsCache'. */
  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void
  /** Pure: the configuration after one effect (DhcpService rules for host gateway / DNS, lease records). */
  applyEffect(state: NetworkState, effect: StateEffect): NetworkState
}

export interface SimLayers {
  readonly link: LinkLayer
  readonly network: NetworkLayer
  readonly services: ServiceLayer
}
