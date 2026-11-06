// Test-only helpers of the router command set: a driver with a lab around the device and a runtime.
import type { Device, Link } from '../../domain'
import type { ArpEntry, DeviceRuntime, DhcpBinding, RequestRecord, RequestResult, RouteEntry, SimRequest } from '../../sim/contract'
import type { CliEnvironment } from '../contract'
import { catalogDevice, CliDriver, testRouter, testSwitch, textOf } from '../core/testCli'
import { routerCommandSet } from './routerCommandSet'

export { catalogDevice, testRouter, testSwitch, textOf }

/** l3Switch24: Gi1/0/1 … Gi1/0/24 switchports, fiber uplinks, VLAN 1 and a shut Vlan1 SVI. */
export function testL3Switch(): Device {
  return catalogDevice('l3Switch24', 'l3', '00:D0:BA:00:00:03')
}

export function copperLink(id: string, a: [string, string], b: [string, string]): Link {
  return { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true, cable: 'copperStraight' }
}

export interface RuntimeTables {
  readonly arp?: readonly ArpEntry[]
  readonly routes?: readonly RouteEntry[]
  readonly dhcpBindings?: readonly DhcpBinding[]
}

export function runtimeOf(deviceId: string, tables: RuntimeTables): DeviceRuntime {
  return {
    deviceId,
    link: { arp: tables.arp ?? [], macTable: [], pending: [], claims: [], seenFrames: [] },
    network: { routes: tables.routes ?? [], sessions: [], ipIdentification: 0, echoIdentifier: 0 },
    services: { dhcpBindings: tables.dhcpBindings ?? [], dhcpClients: [], dnsCache: [], sessions: [], nextEphemeralPort: 49152 },
  }
}

export function finished(id: string, request: SimRequest, result: RequestResult | null): RequestRecord {
  return { id, request, status: 'done', queuedAt: 0, finishedAt: 10, result }
}

/** A CliDriver with the router set, other lab devices and links, a runtime and a clock. */
export class RouterCli extends CliDriver {
  peers: Device[] = []
  links: Link[] = []
  runtime: DeviceRuntime | undefined = undefined
  now = 0

  constructor(device: Device = testRouter()) {
    super(device, [routerCommandSet])
  }

  override get env(): CliEnvironment {
    return { network: { devices: [this.device, ...this.peers], links: this.links }, runtime: this.runtime, now: this.now }
  }

  /** `enable` + `configure terminal`. */
  configure(...lines: readonly string[]): string[] {
    this.typeAll('enable', 'configure terminal')
    return this.typeAll(...lines)
  }

  /** Finishes the pending job with `record`; returns the output. */
  finish(record: RequestRecord): string[] {
    return this.take(this.shell.resume(this.state, this.device, this.env, record))
  }

  /** running-config body as text lines. */
  config(): string[] {
    return this.shell.runningConfig(this.device)
  }
}
