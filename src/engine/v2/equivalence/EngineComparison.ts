// Test-only: runs the v1 engine on a v1 state and the v2 engine on its migration with the same
// questions, and lists every answer that differs (MODEL_V2 §11: behavioural equivalence).
import type { NetworkEngine } from '../../../domain/EngineContract'
import type { NetworkState } from '../../../domain/NetworkTypes'
import type { NetworkEngineV2, NetworkStateV2 } from '../../../domain/v2'
import { migrateV1ToV2 } from '../../../lab/migrations'
import { DeviceLookup } from '../../DeviceLookup'
import { Ipv4 } from '../../Ipv4'
import { SegmentFinder } from '../../SegmentFinder'

/** Addresses probed besides the ones configured in the state. */
const EXTRA_TARGETS: readonly string[] = [
  '8.8.8.8',
  '1.1.1.1',
  '203.0.113.30',
  '10.0.0.5',
  '10.9.9.9',
  '192.168.1.99',
  '192.168.1.254',
  '192.168.20.77',
  '192.168.20.99',
  '127.0.0.1',
  '0.1.2.3',
  '169.254.1.1',
  '255.255.255.255',
  'not-an-ip',
]
const NAMES: readonly string[] = ['google.com', 'ODEME.ornekbanka.com.tr.', 'yok.example']
const FIXED_COMMANDS: readonly string[] = [
  '',
  'help',
  'Foo bar',
  'ipconfig',
  'IPCONFIG /ALL',
  'ipconfig /renew',
  'ipconfig /release',
  'ipconfig /flush',
  'ipconfig /all extra',
  'ping',
  'ping -x 8.8.8.8',
  'ping -l 70000 8.8.8.8',
  'ping -n',
  'ping -n 500 8.8.8.8',
  'ping -t -4 8.8.8.8',
  'ping -n 2 192.168.1.150 -L 1000',
  'tracert',
  'tracert -x 8.8.8.8',
  'nslookup',
]

/** JSON with sorted keys and without undefined members, so key order and absent keys do not matter. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, member: unknown) => {
    if (member === null || typeof member !== 'object' || Array.isArray(member)) return member
    const entries = Object.entries(member as Record<string, unknown>).filter(([, item]) => item !== undefined)
    return Object.fromEntries(entries.sort(([first], [second]) => first.localeCompare(second)))
  })
}

/** A same-subnet address v1 let a router answer from another VLAN (see crossVlanRouterAddress). */
export interface CrossVlanCase {
  hostId: string
  ip: string
}

export interface ComparisonResult {
  mismatches: string[]
  /** Queries left out because v1 relied on its cross-VLAN router answer; v2 is checked separately. */
  crossVlanCases: CrossVlanCase[]
}

const v1Segments = new SegmentFinder()

export class EngineComparison {
  private readonly v1: NetworkEngine
  private readonly v2: NetworkEngineV2
  private readonly mismatches: string[] = []
  private readonly crossVlanCases: CrossVlanCase[] = []

  constructor(v1: NetworkEngine, v2: NetworkEngineV2) {
    this.v1 = v1
    this.v2 = v2
  }

  /** Every question of the engine contract, asked of both engines; returns the differences. */
  compare(state: NetworkState): ComparisonResult {
    this.mismatches.length = 0
    this.crossVlanCases.length = 0
    const migrated = migrateV1ToV2(state)
    const hosts = state.devices.filter((device) => device.host !== undefined).map((device) => device.id)
    const targets = [...new Set([...state.devices.flatMap((device) => DeviceLookup.addressesOf(device)), ...EXTRA_TARGETS])]

    for (const hostId of hosts) {
      for (const ip of targets) {
        if (this.isCrossVlan(state, hostId, ip)) this.crossVlanCases.push({ hostId, ip })
        else this.same(`reach ${hostId}→${ip}`, this.v1.reach(state, hostId, ip), this.v2.reach(migrated, hostId, ip))
      }
      if (this.dnsIsCrossVlan(state, hostId)) continue
      for (const name of NAMES) {
        this.same(`resolve ${hostId} ${name}`, this.v1.resolve(state, hostId, name), this.v2.resolve(migrated, hostId, name))
      }
      this.same(`appLinks ${hostId}`, this.v1.appLinkStatus(state, hostId), this.v2.appLinkStatus(migrated, hostId))
    }
    for (const device of state.devices) {
      this.compareDhcp(state, migrated, device.id)
      const commands = device.host ? [...FIXED_COMMANDS, ...this.probeCommands(state, device.id, targets)] : FIXED_COMMANDS
      for (const command of commands) this.compareCommand(state, migrated, device.id, command)
    }
    for (const link of state.links) {
      this.same(`linkLight ${link.id}`, this.v1.linkLight(state, link.id), this.v2.linkLight(migrated, link.id))
    }
    return { mismatches: [...this.mismatches], crossVlanCases: [...this.crossVlanCases] }
  }

  private probeCommands(state: NetworkState, hostId: string, targets: readonly string[]): string[] {
    const usable = targets.filter((ip) => !this.isCrossVlan(state, hostId, ip))
    const names = this.dnsIsCrossVlan(state, hostId) ? [] : NAMES
    const commands = [...usable, ...names].flatMap((target) => [`ping ${target}`, `tracert ${target}`, `tracert -d ${target}`])
    return this.dnsIsCrossVlan(state, hostId) ? commands : [...commands, 'nslookup google.com', 'nslookup yok.example']
  }

  /**
   * v1 quirk, corrected in v2: a router that joined the host's VLAN through one interface answered a
   * same-subnet ping on the address of an interface in another VLAN, without any reply check (e.g.
   * a display put in the wrong VLAN still "reached" its gateway). v2 answers ARP per interface.
   */
  private isCrossVlan(state: NetworkState, hostId: string, ip: string): boolean {
    const host = DeviceLookup.require(state, hostId)
    if (!host.host || !host.powered || ip === host.host.ip || !Ipv4.sameSubnet(host.host.ip, ip, host.host.mask)) return false
    const attachment = v1Segments.attachment(state, host)
    if (!attachment.ok) return false
    const owner = v1Segments.findAddress(state, v1Segments.segment(state, hostId, attachment.vlan), ip)
    const interfaces = owner?.kind === 'router' ? (owner.routerInterfaces ?? []) : []
    return interfaces.some((item) => item.ip === ip) && !interfaces.some((item) => item.ip === ip && item.vlan === attachment.vlan)
  }

  private dnsIsCrossVlan(state: NetworkState, hostId: string): boolean {
    return (DeviceLookup.require(state, hostId).host?.dns ?? []).some((server) => this.isCrossVlan(state, hostId, server))
  }

  private compareDhcp(state: NetworkState, migrated: NetworkStateV2, deviceId: string): void {
    const v1 = this.v1.renewDhcp(state, deviceId)
    const v2 = this.v2.renewDhcp(migrated, deviceId)
    if (v1.ok && v2.ok) {
      this.same(`renewDhcp ${deviceId} ip`, v1.ip, v2.ip)
      this.same(`renewDhcp ${deviceId} state`, migrateV1ToV2(v1.nextState), v2.nextState)
    } else {
      this.same(`renewDhcp ${deviceId}`, v1, v2)
    }
  }

  private compareCommand(state: NetworkState, migrated: NetworkStateV2, deviceId: string, command: string): void {
    const label = `runCommand ${deviceId} '${command}'`
    const v1 = this.v1.runCommand(state, deviceId, command)
    const v2 = this.v2.runCommand(migrated, deviceId, command)
    this.same(`${label} lines`, v1.lines, v2.lines)
    this.same(`${label} trace`, v1.trace, v2.trace)
    this.same(`${label} nextState`, v1.nextState ? migrateV1ToV2(v1.nextState) : undefined, v2.nextState)
  }

  private same(label: string, v1: unknown, v2: unknown): void {
    const first = canonical(v1)
    const second = canonical(v2)
    if (first !== second) this.mismatches.push(`${label}\n  v1: ${first}\n  v2: ${second}`)
  }
}
