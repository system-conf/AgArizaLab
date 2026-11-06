import type { DeviceContext, IcmpEcho, IcmpError, Ipv4Packet, NetworkTimer, SimRequest } from '../contract'
import { EchoProbes } from './EchoProbes'
import { NetworkRuntimes } from './NetworkRuntimes'
import type { PacketSender } from './PacketSender'
import { PingClient } from './PingClient'
import { TracertClient } from './TracertClient'

/** The ICMP echo applications of a device (ping, tracert), found by request id or echo identifier. */
export class EchoClients {
  private readonly ping: PingClient
  private readonly tracert: TracertClient

  constructor(sender: PacketSender) {
    this.ping = new PingClient(sender)
    this.tracert = new TracertClient(sender)
  }

  start(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    if (request.kind === 'ping') this.ping.start(ctx, requestId, request)
    else if (request.kind === 'tracert') this.tracert.start(ctx, requestId, request)
    else throw new Error(`The network layer does not run '${request.kind}' requests`)
  }

  /** Timers never cancel: one whose session ended is a no-op. */
  onTimer(ctx: DeviceContext, timer: NetworkTimer): void {
    const session = NetworkRuntimes.session(ctx, timer.requestId)
    if (session?.kind === 'ping') this.ping.onTimer(ctx, session, timer)
    else if (session?.kind === 'tracert') this.tracert.onTimer(ctx, session, timer)
  }

  /** True when a client was waiting for this reply. */
  onEchoReply(ctx: DeviceContext, reply: Ipv4Packet, echo: IcmpEcho): boolean {
    const session = NetworkRuntimes.sessionByIdentifier(ctx, echo.identifier)
    if (session?.kind === 'ping') return this.ping.onEchoReply(ctx, session, reply, echo)
    if (session?.kind === 'tracert') return this.tracert.onEchoReply(ctx, session, reply, echo)
    return false
  }

  /** An ICMP error about one of our echoes, from `fromIp` (own address when the local ARP failed). */
  onError(ctx: DeviceContext, fromIp: string, error: IcmpError): boolean {
    const quoted = EchoProbes.quotedEcho(error)
    const session = quoted ? NetworkRuntimes.sessionByIdentifier(ctx, quoted.identifier) : undefined
    if (session?.kind === 'ping') return this.ping.onError(ctx, session, fromIp, error)
    if (session?.kind === 'tracert') return this.tracert.onError(ctx, session, fromIp, error)
    return false
  }
}
