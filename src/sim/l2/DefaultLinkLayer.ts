import { localizedMessage } from '../../i18n/messageKeys'
import { L3Interfaces } from '../../net/L3Interfaces'
import {
  type DeviceChange,
  type DeviceContext,
  DeviceProfiles,
  type FrameArrival,
  type Ipv4SendResult,
  type LinkLayer,
  type LinkSend,
  type LinkTimer,
  type SimRequest,
} from '../contract'
import { AddressClaims } from './AddressClaims'
import { ArpResolver } from './ArpResolver'
import { Bridge } from './Bridge'
import { CloudPorts } from './CloudPorts'
import { Endpoints } from './Endpoints'
import { HubRepeater } from './HubRepeater'
import { LinkChanges } from './LinkChanges'
import { LinkInterfaces, spontaneousFlow } from './LinkInterfaces'
import { LinkSender } from './LinkSender'
import { LinkTables } from './LinkTables'

/**
 * The link layer (S1, docs/SIMULATION.md §7.1). Stateless: everything a device learns lives in
 * `runtime.link`. Composes its behaviour from the device profile and the role of the port a frame
 * arrives on: hub repeater, bridge (switched / radio ports, SVIs), layer-3 endpoint (NIC, routed port,
 * sub-interface), or the internet cloud's handoff port.
 */
export class DefaultLinkLayer implements LinkLayer {
  /** Duplicate-address probes of the device's addresses. */
  onStart(ctx: DeviceContext): void {
    AddressClaims.probeAll(ctx, spontaneousFlow(ctx), () => true)
  }

  onChange(ctx: DeviceContext, change: DeviceChange): void {
    LinkChanges.apply(ctx, change)
  }

  /**
   * After the start-up traffic (coordinator decision 3): MAC tables and ARP caches start empty so the
   * first ARP broadcast and the first flooded frame are visible; duplicate-address results stay.
   */
  onSettled(ctx: DeviceContext): void {
    LinkTables.forgetMac(ctx, () => true)
    LinkTables.forgetArp(ctx, () => true)
  }

  onFrame(ctx: DeviceContext, arrival: FrameArrival): void {
    const event = ctx.arrival
    if (!event) throw new Error(`Frame at ${ctx.device.id} without an arrival event`)
    event.note(1, 'in', localizedMessage('simulation:notes.l1.receivedOnPort', { port: arrival.portId }))
    const profile = DeviceProfiles.of(ctx.device)
    if (profile.repeater) return HubRepeater.repeat(ctx, arrival, event)
    if (profile.isp) return CloudPorts.receive(ctx, arrival, event)
    const port = LinkInterfaces.port(ctx.device, arrival.portId)
    switch (port?.role) {
      case 'switched':
      case 'radio':
        return Bridge.receive(ctx, arrival, event, port)
      case 'host':
      case 'routed':
        return Endpoints.receivePort(ctx, arrival, event, port)
      default:
        return event.conclude('dropped', 2, 'unsupported')
    }
  }

  send(ctx: DeviceContext, request: LinkSend): void {
    if (DeviceProfiles.of(ctx.device).isp) return CloudPorts.send(ctx, request)
    LinkSender.send(ctx, request)
  }

  onTimer(ctx: DeviceContext, timer: LinkTimer): void {
    if (timer.kind === 'arpRetry') ArpResolver.onRetry(ctx, timer)
  }

  /** `clearTable`: `arp -d *` / `clear arp-cache` (dynamic entries; pending resolutions go on) and `clear mac address-table dynamic`. */
  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    let entries = 0
    if (request.kind === 'clearTable' && request.table === 'arp') entries = LinkTables.forgetArp(ctx, (entry) => entry.state === 'reachable')
    if (request.kind === 'clearTable' && request.table === 'mac') entries = LinkTables.forgetMac(ctx, () => true)
    ctx.report(requestId, { kind: 'cleared', entries }, true)
  }

  interfaceReady(ctx: DeviceContext, interfaceId: string): Ipv4SendResult {
    if (DeviceProfiles.of(ctx.device).isp) return CloudPorts.readiness(ctx, interfaceId)
    const iface = L3Interfaces.find(ctx.device, interfaceId)
    if (!iface) return { ok: false, reason: 'invalidConfig' }
    return LinkInterfaces.readiness(ctx, iface)
  }
}
