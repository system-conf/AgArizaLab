import type { DeviceContext, NetworkRuntime, NetworkSession, RouteEntry } from '../contract'

const IDENTIFICATION_RANGE = 65536

/** Writes of the network slice of a device's runtime (only S2 writes it). */
export class NetworkRuntimes {
  static setRoutes(ctx: DeviceContext, routes: readonly RouteEntry[]): void {
    NetworkRuntimes.update(ctx, (network) => ({ ...network, routes }))
  }

  /** Next IPv4 identification value (a per-device counter, wraps at 65536). */
  static takeIdentification(ctx: DeviceContext): number {
    const value = ctx.runtime.network.ipIdentification % IDENTIFICATION_RANGE
    NetworkRuntimes.update(ctx, (network) => ({ ...network, ipIdentification: (value + 1) % IDENTIFICATION_RANGE }))
    return value
  }

  /** ICMP echo identifier of a new ping / tracert. */
  static takeEchoIdentifier(ctx: DeviceContext): number {
    const value = ctx.runtime.network.echoIdentifier
    NetworkRuntimes.update(ctx, (network) => ({ ...network, echoIdentifier: (value + 1) % IDENTIFICATION_RANGE }))
    return value
  }

  static session(ctx: DeviceContext, requestId: string): NetworkSession | undefined {
    return ctx.runtime.network.sessions.find((session) => session.requestId === requestId)
  }

  /** The client using an echo identifier. */
  static sessionByIdentifier(ctx: DeviceContext, identifier: number): NetworkSession | undefined {
    return ctx.runtime.network.sessions.find((session) => session.identifier === identifier)
  }

  /** Adds or replaces the session of its request (kept in start order). */
  static putSession(ctx: DeviceContext, session: NetworkSession): void {
    NetworkRuntimes.update(ctx, (network) => {
      const exists = network.sessions.some((candidate) => candidate.requestId === session.requestId)
      const sessions = exists
        ? network.sessions.map((candidate) => (candidate.requestId === session.requestId ? session : candidate))
        : [...network.sessions, session]
      return { ...network, sessions }
    })
  }

  static removeSession(ctx: DeviceContext, requestId: string): void {
    NetworkRuntimes.update(ctx, (network) => ({ ...network, sessions: network.sessions.filter((session) => session.requestId !== requestId) }))
  }

  private static update(ctx: DeviceContext, change: (network: NetworkRuntime) => NetworkRuntime): void {
    ctx.updateRuntime((runtime) => ({ ...runtime, network: change(runtime.network) }))
  }
}
