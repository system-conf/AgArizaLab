import {
  type DeviceContext,
  type DhcpClientLease,
  type ServiceRuntime,
  type ServiceSession,
  SIM_PORTS,
} from '../contract'

const MAX_PORT = 65535

/** Reads and writes the services slice of the current device's runtime (immutable updates). */
export class ServiceRuntimes {
  static of(ctx: DeviceContext): ServiceRuntime {
    return ctx.runtime.services
  }

  static update(ctx: DeviceContext, change: (services: ServiceRuntime) => ServiceRuntime): void {
    ctx.updateRuntime((runtime) => ({ ...runtime, services: change(runtime.services) }))
  }

  /** Next ephemeral port, sequential from 49152 like Windows (wraps around). */
  static allocatePort(ctx: DeviceContext): number {
    const port = ServiceRuntimes.of(ctx).nextEphemeralPort
    const next = port >= MAX_PORT ? SIM_PORTS.ephemeralStart : port + 1
    ServiceRuntimes.update(ctx, (services) => ({ ...services, nextEphemeralPort: next }))
    return port
  }

  /** Seeded random id of `bits` bits (DHCP xid 32, DNS id 16, TCP ISN 32). */
  static randomId(ctx: DeviceContext, bits: 16 | 32): number {
    return Math.floor(ctx.random() * 2 ** bits)
  }

  static sessions(ctx: DeviceContext): readonly ServiceSession[] {
    return ServiceRuntimes.of(ctx).sessions
  }

  static addSession(ctx: DeviceContext, session: ServiceSession): void {
    ServiceRuntimes.update(ctx, (services) => ({ ...services, sessions: [...services.sessions, session] }))
  }

  /** Replaces (or with null removes) the sessions `matches` selects. */
  static replaceSession(ctx: DeviceContext, matches: (session: ServiceSession) => boolean, next: ServiceSession | null): void {
    ServiceRuntimes.update(ctx, (services) => ({
      ...services,
      sessions: services.sessions.flatMap((session) => (matches(session) ? (next ? [next] : []) : [session])),
    }))
  }

  static lease(ctx: DeviceContext, portId: string): DhcpClientLease | undefined {
    return ServiceRuntimes.of(ctx).dhcpClients.find((lease) => lease.portId === portId)
  }

  /** Writes the client state of one NIC (one entry per port). */
  static setLease(ctx: DeviceContext, lease: DhcpClientLease): void {
    ServiceRuntimes.update(ctx, (services) => {
      const exists = services.dhcpClients.some((entry) => entry.portId === lease.portId)
      const dhcpClients = exists
        ? services.dhcpClients.map((entry) => (entry.portId === lease.portId ? lease : entry))
        : [...services.dhcpClients, lease]
      return { ...services, dhcpClients }
    })
  }
}
