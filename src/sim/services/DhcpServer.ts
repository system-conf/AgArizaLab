import type { DhcpPool } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import { DeviceAddresses } from '../../engine/DeviceAddresses'
import { DhcpPoolAllocator } from '../../engine/DhcpPoolAllocator'
import { L3Interfaces } from '../../engine/L3Interfaces'
import { RuntimeTables } from '../core/RuntimeTables'
import {
  type DeviceContext,
  type DhcpBinding,
  type DhcpMessage,
  type DhcpOptions,
  LIMITED_BROADCAST_IP,
  SIM_PORTS,
  SIM_TIMING,
  type TransportDelivery,
  UNSPECIFIED_IP,
} from '../contract'
import { DhcpConfig } from './DhcpConfig'
import { DhcpRelay } from './DhcpRelay'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

/** An offer is held for the client's whole retry window. */
const OFFER_HOLD_MS = SIM_TIMING.dhcpRetransmitMs * SIM_TIMING.dhcpAttempts

/** Where a server message to the client goes: broadcast on the receiving interface, or back to the relay. */
interface ReplyPath {
  readonly serverIp: string
  readonly relayed: boolean
}

/**
 * DHCP server (docs/SIMULATION.md §7.3): pool by the receiving interface (or giaddr of a relayed
 * request), DhcpPoolAllocator with the engine's in-use set + offers held for other clients, exclusions.
 * OFFER / ACK are broadcast (the client has no address yet) or sent back to the relay agent.
 */
export class DhcpServer {
  /** UDP 67: a device with DHCP settings (on or off) or a relay agent. */
  static listens(ctx: DeviceContext): boolean {
    return ctx.device.services?.dhcp !== undefined || DhcpRelay.hasHelpers(ctx.device)
  }

  static onMessage(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage): void {
    switch (message.messageType) {
      case 'discover':
      case 'request':
        return DhcpServer.fromClient(ctx, delivery, message)
      case 'release':
      case 'decline':
        return DhcpServer.release(ctx, delivery, message)
      case 'offer':
      case 'ack':
      case 'nak':
        return DhcpRelay.toClient(ctx, delivery, message)
      case 'inform':
        return delivery.event.conclude('dropped', 7, 'unsupported')
    }
  }

  private static fromClient(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage): void {
    const { event } = delivery
    const relayed = message.relayIp !== UNSPECIFIED_IP
    const dhcp = ctx.device.services?.dhcp
    const pool = relayed ? DhcpConfig.poolForRelay(ctx.device, message.relayIp) : DhcpConfig.poolForInterface(ctx.device, delivery.interfaceId)
    if (dhcp?.enabled === true && pool) {
      const path: ReplyPath = { serverIp: DhcpServer.ownAddress(ctx, delivery, relayed), relayed }
      if (message.messageType === 'discover') return DhcpServer.offer(ctx, delivery, message, pool, path)
      return DhcpServer.acknowledge(ctx, delivery, message, pool, path)
    }
    const helpers = relayed ? [] : DhcpRelay.helpersOf(ctx.device, delivery.interfaceId)
    if (helpers.length > 0) return DhcpRelay.toServers(ctx, delivery, message, helpers)
    if (dhcp?.enabled !== true) {
      ServiceNotes.add(event, 'in', 'dhcpServiceDisabled')
      return event.conclude('dropped', 7, 'dhcpServiceDisabled')
    }
    ServiceNotes.add(event, 'in', 'dhcpNoPool', { iface: relayed ? message.relayIp : delivery.interfaceId })
    event.conclude('dropped', 7, 'dhcpNoPool')
  }

  private static offer(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage, pool: DhcpPool, path: ReplyPath): void {
    const { event } = delivery
    const ip = DhcpServer.allocate(ctx, pool, message.clientMac)
    if (ip === null) {
      ServiceNotes.add(event, 'in', 'dhcpPoolExhausted', { pool: pool.id })
      return event.conclude('dropped', 7, 'dhcpPoolExhausted')
    }
    DhcpServer.bind(ctx, { poolId: pool.id, ip, mac: message.clientMac, state: 'offered', transactionId: message.transactionId, leaseStart: ctx.now, leaseExpires: ctx.now + OFFER_HOLD_MS })
    ServiceNotes.add(event, 'in', 'dhcpOffer', { ip, pool: pool.id })
    event.conclude('replied', 7)
    DhcpServer.answer(ctx, delivery, message, path, 'offer', ip, DhcpServer.leaseOptions(pool, path.serverIp), [
      ServiceNotes.message('dhcpOffer', { ip, pool: pool.id }),
    ])
  }

  /** REQUEST: ACK when the requested address is still the one this pool gives the client, else NAK. */
  private static acknowledge(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage, pool: DhcpPool, path: ReplyPath): void {
    const { event } = delivery
    const chosen = message.options.serverIdentifier
    if (chosen !== undefined && !DeviceAddresses.has(ctx.device, chosen)) {
      DhcpServer.unbind(ctx, message.clientMac)
      ServiceNotes.add(event, 'in', 'dhcpOtherServer', { server: chosen })
      return event.conclude('delivered', 7)
    }
    const requested = message.options.requestedIp ?? message.clientIp
    const ip = DhcpServer.allocate(ctx, pool, message.clientMac)
    event.conclude('replied', 7)
    if (ip === null || ip !== requested) {
      DhcpServer.unbind(ctx, message.clientMac)
      ServiceNotes.add(event, 'in', 'dhcpNak', { ip: requested })
      DhcpServer.answer(ctx, delivery, message, path, 'nak', UNSPECIFIED_IP, { serverIdentifier: path.serverIp }, [ServiceNotes.message('dhcpNak', { ip: requested })])
      return
    }
    const leaseMs = SIM_TIMING.dhcpLeaseSeconds * 1000
    DhcpServer.bind(ctx, { poolId: pool.id, ip, mac: message.clientMac, state: 'bound', transactionId: message.transactionId, leaseStart: ctx.now, leaseExpires: ctx.now + leaseMs })
    ServiceNotes.add(event, 'in', 'dhcpAck', { ip, mac: message.clientMac })
    DhcpServer.answer(ctx, delivery, message, path, 'ack', ip, DhcpServer.leaseOptions(pool, path.serverIp), [
      ServiceNotes.message('dhcpAck', { ip, mac: message.clientMac }),
    ])
  }

  /** RELEASE: the binding goes, the pool's lease record stays (DhcpService rule). */
  private static release(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage): void {
    const { event } = delivery
    if (ctx.device.services?.dhcp?.enabled !== true) {
      ServiceNotes.add(event, 'in', 'dhcpServiceDisabled')
      return event.conclude('dropped', 7, 'dhcpServiceDisabled')
    }
    DhcpServer.unbind(ctx, message.clientMac)
    ServiceNotes.add(event, 'in', 'dhcpReleaseReceived', { ip: message.clientIp, mac: message.clientMac })
    event.conclude('delivered', 7)
  }

  /** Engine parity: addresses of other devices and the client's other interfaces, plus live offers / leases of other MACs. */
  private static allocate(ctx: DeviceContext, pool: DhcpPool, mac: string): string | null {
    const inUse = DhcpConfig.addressesInUse(ctx.network, mac)
    for (const binding of ServiceRuntimes.of(ctx).dhcpBindings) {
      if (binding.mac.toUpperCase() !== mac.toUpperCase() && RuntimeTables.isLive({ expiresAt: binding.leaseExpires }, ctx.now)) inUse.add(binding.ip)
    }
    return DhcpPoolAllocator.pick(pool, mac, inUse, ctx.device.services?.dhcp?.excludedRanges ?? [])
  }

  private static leaseOptions(pool: DhcpPool, serverIp: string): DhcpOptions {
    return {
      subnetMask: pool.mask,
      ...(pool.defaultRouter === '' ? {} : { routers: [pool.defaultRouter] }),
      ...(pool.dnsServers.length === 0 ? {} : { dnsServers: [...pool.dnsServers] }),
      leaseSeconds: SIM_TIMING.dhcpLeaseSeconds,
      serverIdentifier: serverIp,
    }
  }

  /** The server's own address for this exchange: the receiving interface, or the address the relay sent to. */
  private static ownAddress(ctx: DeviceContext, delivery: TransportDelivery, relayed: boolean): string {
    if (relayed) return delivery.packet.dst
    const iface = L3Interfaces.find(ctx.device, delivery.interfaceId)
    return iface?.address ?? delivery.packet.dst
  }

  private static answer(
    ctx: DeviceContext,
    delivery: TransportDelivery,
    request: DhcpMessage,
    path: ReplyPath,
    messageType: 'offer' | 'ack' | 'nak',
    yourIp: string,
    options: DhcpOptions,
    notes: readonly LocalizedMessage[],
  ): void {
    const message = ServiceWire.dhcp({
      messageType,
      transactionId: request.transactionId,
      clientMac: request.clientMac,
      yourIp,
      serverIp: path.serverIp,
      relayIp: request.relayIp,
      broadcast: request.broadcast,
      options,
    })
    const common = { ids: ctx.newPdu(delivery.ids.flowId), src: path.serverIp, causeEventId: delivery.event.id, notes }
    if (path.relayed) {
      ServiceSender.send(ctx, { ...common, dst: request.relayIp, payload: ServiceWire.udp(SIM_PORTS.dhcpServer, SIM_PORTS.dhcpServer, message) })
      return
    }
    ServiceSender.send(ctx, {
      ...common,
      dst: LIMITED_BROADCAST_IP,
      payload: ServiceWire.udp(SIM_PORTS.dhcpServer, SIM_PORTS.dhcpClient, message),
      egressInterfaceId: delivery.interfaceId,
      linkDestination: { kind: 'broadcast' },
    })
  }

  /** One binding per MAC. */
  private static bind(ctx: DeviceContext, binding: DhcpBinding): void {
    const mac = binding.mac.toUpperCase()
    ServiceRuntimes.update(ctx, (services) => ({
      ...services,
      dhcpBindings: [...services.dhcpBindings.filter((entry) => entry.mac.toUpperCase() !== mac), binding],
    }))
  }

  private static unbind(ctx: DeviceContext, clientMac: string): void {
    const mac = clientMac.toUpperCase()
    ServiceRuntimes.update(ctx, (services) => ({ ...services, dhcpBindings: services.dhcpBindings.filter((entry) => entry.mac.toUpperCase() !== mac) }))
  }
}
