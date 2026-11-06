import {
  type DeviceContext,
  type DhcpAdapterResult,
  type DhcpClientLease,
  type DhcpMessage,
  LIMITED_BROADCAST_IP,
  type ServiceTimer,
  SIM_PORTS,
  SIM_TIMING,
  type StateEffect,
  type TransportDelivery,
  UNSPECIFIED_IP,
} from '../contract'
import { L3Interfaces } from '../../net/L3Interfaces'
import type { LocalizedMessage } from '../../domain/Messages'
import { DhcpConfig } from './DhcpConfig'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

type RetransmitTimer = Extract<ServiceTimer, { kind: 'dhcpRetransmit' }>
type ActivePhase = 'selecting' | 'requesting'

/** How one NIC's exchange ended (handed to the renew request that started it). */
export interface NicOutcome {
  readonly adapter: DhcpAdapterResult
  readonly effect?: StateEffect
}

/**
 * DHCP client of one NIC (RFC 2131, reduced; docs/SIMULATION.md §7.3): DISCOVER → first OFFER wins →
 * REQUEST → ACK → `dhcpLeaseBound` effect. Each phase sends up to SIM_TIMING.dhcpAttempts messages
 * SIM_TIMING.dhcpRetransmitMs apart, then gives up with `requestTimedOut`. `onFinished` receives the
 * outcome (DhcpRequests continues with the next NIC).
 */
export class DhcpClient {
  /** UDP 68 is open while a NIC waits for an OFFER or ACK. */
  static listens(ctx: DeviceContext): boolean {
    return ServiceRuntimes.of(ctx).dhcpClients.some((lease) => DhcpClient.isActive(lease))
  }

  /** Starts DORA on `portId`. */
  static start(ctx: DeviceContext, portId: string, requestId: string | null): void {
    const lease: DhcpClientLease = {
      portId,
      phase: 'selecting',
      transactionId: ServiceRuntimes.randomId(ctx, 32),
      requestId,
      attempts: 1,
    }
    ServiceRuntimes.setLease(ctx, lease)
    DhcpClient.transmit(ctx, lease)
  }

  static onMessage(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage, onFinished: (ctx: DeviceContext, lease: DhcpClientLease, outcome: NicOutcome) => void): void {
    const { event } = delivery
    const lease = ServiceRuntimes.of(ctx).dhcpClients.find((entry) => DhcpClient.isActive(entry) && entry.transactionId === message.transactionId)
    if (!lease || DhcpClient.macOf(ctx, lease.portId).toUpperCase() !== message.clientMac.toUpperCase()) {
      ServiceNotes.add(event, 'in', 'dhcpNotForThisClient', { mac: message.clientMac })
      return event.conclude('dropped', 7, 'dhcpNotForThisClient')
    }
    const expected = message.messageType === 'offer' ? 'selecting' : 'requesting'
    if (lease.phase !== expected || (message.messageType !== 'offer' && message.messageType !== 'ack' && message.messageType !== 'nak')) {
      ServiceNotes.add(event, 'in', 'dhcpOfferIgnored')
      return event.conclude('dropped', 7, 'staleReply')
    }
    const serverIp = message.options.serverIdentifier ?? delivery.packet.src
    if (message.messageType === 'offer') {
      ServiceNotes.add(event, 'in', 'dhcpOfferReceived', { ip: message.yourIp, server: serverIp })
      event.conclude('replied', 7)
      const requesting: DhcpClientLease = { ...lease, phase: 'requesting', attempts: 1, offeredIp: message.yourIp, serverIp }
      ServiceRuntimes.setLease(ctx, requesting)
      DhcpClient.transmit(ctx, requesting, event.id)
      return
    }
    if (message.messageType === 'nak') {
      ServiceNotes.add(event, 'in', 'dhcpNak', { ip: lease.offeredIp ?? message.yourIp })
      event.conclude('delivered', 7)
      const failed: DhcpClientLease = { ...lease, phase: 'failed' }
      ServiceRuntimes.setLease(ctx, failed)
      return onFinished(ctx, failed, { adapter: { portId: lease.portId, ok: false, reason: 'dhcpNak' } })
    }
    DhcpClient.bound(ctx, delivery, message, lease, onFinished)
  }

  /** Retransmits, or gives up after the last attempt. Stale timers (other phase / attempt / exchange) do nothing. */
  static onTimer(ctx: DeviceContext, timer: RetransmitTimer, onFinished: (ctx: DeviceContext, lease: DhcpClientLease, outcome: NicOutcome) => void): void {
    const lease = ServiceRuntimes.lease(ctx, timer.portId)
    if (!lease || !DhcpClient.isActive(lease) || lease.transactionId !== timer.transactionId) return
    if ((timer.phase !== undefined && timer.phase !== lease.phase) || (timer.attempt !== undefined && timer.attempt !== lease.attempts)) return
    if (lease.attempts < SIM_TIMING.dhcpAttempts) {
      const next: DhcpClientLease = { ...lease, attempts: lease.attempts + 1 }
      ServiceRuntimes.setLease(ctx, next)
      DhcpClient.transmit(ctx, next)
      return
    }
    const event = ctx.openEvent({ flowId: DhcpClient.flowOf(ctx, lease), protocol: 'dhcp' })
    ServiceNotes.add(event, 'out', 'dhcpTimeout', { attempts: SIM_TIMING.dhcpAttempts })
    event.conclude('timedOut', 7, 'requestTimedOut')
    const failed: DhcpClientLease = { ...lease, phase: 'failed' }
    ServiceRuntimes.setLease(ctx, failed)
    onFinished(ctx, failed, { adapter: { portId: lease.portId, ok: false, reason: 'requestTimedOut' } })
  }

  static macOf(ctx: DeviceContext, portId: string): string {
    return ctx.device.ports.find((port) => port.id === portId)?.mac ?? ctx.device.baseMac
  }

  static flowOf(ctx: DeviceContext, lease: DhcpClientLease): string {
    return lease.requestId ?? `bg:${ctx.device.id}`
  }

  private static isActive(lease: DhcpClientLease): lease is DhcpClientLease & { phase: ActivePhase } {
    return lease.phase === 'selecting' || lease.phase === 'requesting'
  }

  /** ACK: the lease becomes configuration through the `dhcpLeaseBound` effect. */
  private static bound(
    ctx: DeviceContext,
    delivery: TransportDelivery,
    message: DhcpMessage,
    lease: DhcpClientLease,
    onFinished: (ctx: DeviceContext, lease: DhcpClientLease, outcome: NicOutcome) => void,
  ): void {
    const { options, yourIp: ip } = message
    const serverIp = lease.serverIp ?? options.serverIdentifier ?? delivery.packet.src
    const mask = options.subnetMask ?? ''
    const gateway = options.routers?.[0] ?? ''
    const dnsServers = options.dnsServers ?? []
    const source = DhcpConfig.leaseSource(ctx.network, serverIp, ip)
    const effect: StateEffect = {
      kind: 'dhcpLeaseBound',
      clientId: ctx.device.id,
      portId: lease.portId,
      mac: DhcpClient.macOf(ctx, lease.portId),
      ip,
      mask,
      gateway,
      dnsServers: [...dnsServers],
      serverId: source?.serverId ?? '',
      poolId: source?.pool.id ?? '',
    }
    ctx.applyEffect(effect)
    const leaseSeconds = options.leaseSeconds ?? SIM_TIMING.dhcpLeaseSeconds
    const bound: DhcpClientLease = { ...lease, phase: 'bound', offeredIp: ip, serverIp, leaseObtainedAt: ctx.now, leaseExpiresAt: ctx.now + leaseSeconds * 1000 }
    ServiceRuntimes.setLease(ctx, bound)
    ServiceNotes.add(delivery.event, 'in', 'dhcpBound', { ip, mask, gateway })
    delivery.event.conclude('delivered', 7)
    onFinished(ctx, bound, { adapter: { portId: lease.portId, ok: true, ip, mask, gateway, dnsServers: [...dnsServers], serverIp }, effect })
  }

  /** Sends the message of the lease's phase (DISCOVER / REQUEST, broadcast from 0.0.0.0) and arms the retransmit timer. */
  private static transmit(ctx: DeviceContext, lease: DhcpClientLease, causeEventId?: number): void {
    const phase: ActivePhase = lease.phase === 'requesting' ? 'requesting' : 'selecting'
    const nic = L3Interfaces.find(ctx.device, lease.portId)
    const current = nic && nic.address !== '' ? nic.address : undefined
    const requestedIp = phase === 'requesting' ? lease.offeredIp : current
    const message = ServiceWire.dhcp({
      messageType: phase === 'selecting' ? 'discover' : 'request',
      transactionId: lease.transactionId,
      clientMac: DhcpClient.macOf(ctx, lease.portId),
      options: {
        hostName: ctx.device.name,
        ...(requestedIp === undefined ? {} : { requestedIp }),
        ...(phase === 'requesting' && lease.serverIp !== undefined ? { serverIdentifier: lease.serverIp } : {}),
      },
    })
    const notes: LocalizedMessage[] =
      phase === 'selecting'
        ? [ServiceNotes.message('dhcpDiscover')]
        : [ServiceNotes.message('dhcpRequest', { ip: lease.offeredIp ?? '' })]
    notes.push(
      lease.attempts > 1
        ? ServiceNotes.message('dhcpRetry', { attempt: lease.attempts, attempts: SIM_TIMING.dhcpAttempts })
        : ServiceNotes.message(phase === 'selecting' ? 'dhcpDiscoverBroadcast' : 'dhcpRequestBroadcast'),
    )
    ServiceSender.send(ctx, {
      ids: ctx.newPdu(DhcpClient.flowOf(ctx, lease)),
      dst: LIMITED_BROADCAST_IP,
      src: UNSPECIFIED_IP,
      payload: ServiceWire.udp(SIM_PORTS.dhcpClient, SIM_PORTS.dhcpServer, message),
      egressInterfaceId: lease.portId,
      linkDestination: { kind: 'broadcast' },
      ...(causeEventId === undefined ? {} : { causeEventId }),
      notes,
    })
    ctx.schedule(SIM_TIMING.dhcpRetransmitMs, {
      layer: 'services',
      kind: 'dhcpRetransmit',
      portId: lease.portId,
      transactionId: lease.transactionId,
      phase,
      attempt: lease.attempts,
    })
  }
}
