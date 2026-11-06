import { HostAttachment } from '../../engine/HostAttachment'
import { type L3Interface, L3Interfaces } from '../../engine/L3Interfaces'
import {
  type DeviceContext,
  type DhcpAdapterFailure,
  type DhcpAdapterResult,
  type DhcpClientLease,
  type DhcpRenewSession,
  type ServiceSession,
  type SimDhcpReleaseRequest,
  type SimDhcpRenewRequest,
  SIM_PORTS,
  type StateEffect,
} from '../contract'
import { DhcpClient, type NicOutcome } from './DhcpClient'
import { DhcpConfig } from './DhcpConfig'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

/**
 * `ipconfig /renew` and `/release` (docs/SIMULATION.md §5.2, §7.3) with the preconditions of the rule
 * engine's DhcpService: the NICs are the active ones in 'dhcp' mode (or the named one); none →
 * invalidConfig; a NIC whose link does not work fails with cableDisconnected / portDisabled. Renew runs
 * DORA on the NICs one after the other and reports one adapter result per NIC.
 */
export class DhcpRequests {
  static renew(ctx: DeviceContext, requestId: string, request: SimDhcpRenewRequest): void {
    const nics = DhcpRequests.dhcpNics(ctx, requestId, request, 'renew')
    if (!nics) return
    ServiceRuntimes.addSession(ctx, { kind: 'dhcpRenew', requestId, queue: nics.map((nic) => nic.id), adapters: [], effects: [] })
    DhcpRequests.next(ctx, requestId)
  }

  /** DHCPRELEASE (unicast to the server, no answer), then the address goes through `dhcpLeaseReleased`. */
  static release(ctx: DeviceContext, requestId: string, request: SimDhcpReleaseRequest): void {
    const nics = DhcpRequests.dhcpNics(ctx, requestId, request, 'release')
    if (!nics) return
    const adapters: DhcpAdapterResult[] = []
    const effects: StateEffect[] = []
    for (const nic of nics) {
      const failure = DhcpRequests.linkFailure(ctx, requestId, nic)
      if (failure) {
        adapters.push({ portId: nic.id, ok: false, reason: failure })
        continue
      }
      DhcpRequests.sendRelease(ctx, requestId, nic)
      const effect: StateEffect = { kind: 'dhcpLeaseReleased', clientId: ctx.device.id, portId: nic.id }
      ctx.applyEffect(effect)
      effects.push(effect)
      adapters.push({ portId: nic.id, ok: true, released: true })
      const lease = ServiceRuntimes.lease(ctx, nic.id)
      ServiceRuntimes.setLease(ctx, {
        portId: nic.id,
        phase: 'released',
        transactionId: lease?.transactionId ?? 0,
        requestId,
        attempts: 0,
      })
    }
    ctx.report(requestId, { kind: 'dhcp', operation: 'release', adapters, effects }, true)
  }

  /** A NIC's exchange ended: record it and go on with the renew request it belongs to. */
  static onNicFinished(ctx: DeviceContext, lease: DhcpClientLease, outcome: NicOutcome): void {
    if (lease.requestId === null) return
    const requestId = lease.requestId
    const session = DhcpRequests.session(ctx, requestId)
    if (!session || session.queue[0] !== lease.portId) return
    DhcpRequests.store(ctx, {
      ...session,
      queue: session.queue.slice(1),
      adapters: [...session.adapters, outcome.adapter],
      effects: outcome.effect ? [...session.effects, outcome.effect] : session.effects,
    })
    DhcpRequests.next(ctx, requestId)
  }

  /** Starts DORA on the next NIC that can send, or reports the result when none is left. */
  private static next(ctx: DeviceContext, requestId: string): void {
    for (let session = DhcpRequests.session(ctx, requestId); session; session = DhcpRequests.session(ctx, requestId)) {
      const portId = session.queue[0]
      if (portId === undefined) {
        DhcpRequests.store(ctx, null, requestId)
        ctx.report(requestId, { kind: 'dhcp', operation: 'renew', adapters: session.adapters, effects: session.effects }, true)
        return
      }
      const nic = L3Interfaces.find(ctx.device, portId)
      const failure = nic ? DhcpRequests.linkFailure(ctx, requestId, nic) : 'invalidConfig'
      if (!failure) return DhcpClient.start(ctx, portId, requestId)
      DhcpRequests.store(ctx, { ...session, queue: session.queue.slice(1), adapters: [...session.adapters, { portId, ok: false, reason: failure }] })
    }
  }

  /** The NICs to work on; reports invalidConfig (and returns null) when there is none. */
  private static dhcpNics(
    ctx: DeviceContext,
    requestId: string,
    request: SimDhcpRenewRequest | SimDhcpReleaseRequest,
    operation: 'renew' | 'release',
  ): L3Interface[] | null {
    const { portId } = request
    const candidates =
      portId === undefined ? HostAttachment.activeNics(ctx.topology, ctx.device) : L3Interfaces.nics(ctx.device).filter((nic) => nic.id === portId)
    const nics = candidates.filter((nic) => nic.addressing === 'dhcp')
    if (nics.length > 0) return nics
    const event = ctx.openEvent({ flowId: requestId, protocol: 'dhcp' })
    ServiceNotes.add(event, 'out', 'dhcpNoDhcpNic')
    event.conclude('dropped', 7, 'invalidConfig')
    const adapter: DhcpAdapterResult = { portId: portId ?? candidates[0]?.id ?? '', ok: false, reason: 'invalidConfig' }
    ctx.report(requestId, { kind: 'dhcp', operation, adapters: [adapter], effects: [] }, true)
    return null
  }

  /** Link problem of a NIC (engine HostAttachment.attach), logged as a PDU-less dropped event. */
  private static linkFailure(ctx: DeviceContext, requestId: string, nic: L3Interface): DhcpAdapterFailure | null {
    const attachment = HostAttachment.attach(ctx.topology, nic)
    if (attachment.ok) return null
    ctx.openEvent({ flowId: requestId, protocol: 'dhcp' }).conclude('dropped', 7, attachment.reason)
    return attachment.reason
  }

  private static sendRelease(ctx: DeviceContext, requestId: string, nic: L3Interface): void {
    if (nic.address === '') return
    const mac = DhcpClient.macOf(ctx, nic.id)
    const lease = ServiceRuntimes.lease(ctx, nic.id)
    const known = lease?.phase === 'bound' && lease.offeredIp === nic.address ? lease.serverIp : undefined
    const server = known ?? DhcpConfig.releaseTarget(ctx.network, mac, nic.address)
    if (server === undefined) return
    const message = ServiceWire.dhcp({
      messageType: 'release',
      transactionId: ServiceRuntimes.randomId(ctx, 32),
      clientMac: mac,
      clientIp: nic.address,
      broadcast: false,
      options: { serverIdentifier: server },
    })
    ServiceSender.send(ctx, {
      ids: ctx.newPdu(requestId),
      dst: server,
      src: nic.address,
      payload: ServiceWire.udp(SIM_PORTS.dhcpClient, SIM_PORTS.dhcpServer, message),
      notes: [ServiceNotes.message('dhcpRelease', { ip: nic.address })],
    })
  }

  private static session(ctx: DeviceContext, requestId: string): DhcpRenewSession | undefined {
    return ServiceRuntimes.sessions(ctx).find((session): session is DhcpRenewSession => session.kind === 'dhcpRenew' && session.requestId === requestId)
  }

  private static store(ctx: DeviceContext, session: DhcpRenewSession | null, requestId = session?.requestId): void {
    const matches = (candidate: ServiceSession) => candidate.kind === 'dhcpRenew' && candidate.requestId === requestId
    ServiceRuntimes.replaceSession(ctx, matches, session)
  }
}
