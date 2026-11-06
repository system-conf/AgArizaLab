import type { ArpInterfaceView } from '../../engine/ArpFormatter'
import type { AdapterView } from '../../engine/CommandFormatter'
import { HostAdapters } from '../../engine/HostAdapters'
import { HostAttachment } from '../../net/HostAttachment'
import { Ipv4 } from '../../net/Ipv4'
import { L3Interfaces } from '../../net/L3Interfaces'
import { Topology } from '../../net/Topology'
import type { SimulationEngine } from '../contract'
import { RuntimeTables } from '../core/RuntimeTables'

/** Windows numbers the first network interface 0xb in `arp -a`; the lab counts on from there. */
const FIRST_INTERFACE_INDEX = 0xb

/** What a host's command prompt shows of the simulation: its adapters (ipconfig) and its ARP cache (arp -a). */
export class SimHostViews {
  /**
   * ipconfig's adapters from the engine's configuration (DHCP leases included). A duplicate address is
   * what the device's own duplicate-address probe found (docs/SIMULATION.md §4 `claims`).
   */
  static adapters(engine: SimulationEngine, deviceId: string): AdapterView[] {
    const claims = engine.runtime(deviceId)?.link.claims ?? []
    return HostAdapters.views(engine.network(), deviceId, (nic) =>
      claims.some((claim) => claim.interfaceId === nic.id && claim.address === nic.address && claim.duplicate),
    )
  }

  /** Whether the NIC (else the host's first active one) is a Wi-Fi adapter (Windows error texts). */
  static isWireless(engine: SimulationEngine, deviceId: string, portId: string | undefined): boolean {
    const topology = Topology.of(engine.network())
    const device = topology.require(deviceId)
    const named = portId === undefined || portId === '' ? HostAttachment.activeNics(topology, device)[0]?.portId : portId
    return HostAdapters.isWireless(device, named)
  }

  /** `arp -a [ip]`: the resolved entries of the host's NICs, in NIC order, each sorted by address. */
  static arpTable(engine: SimulationEngine, deviceId: string, onlyIp?: string): ArpInterfaceView[] {
    const device = Topology.of(engine.network()).require(deviceId)
    const runtime = engine.runtime(deviceId)
    const entries = runtime ? RuntimeTables.arp(runtime, engine.time) : []
    return L3Interfaces.nics(device).map((nic, index) => ({
      address: nic.address === '' ? '0.0.0.0' : nic.address,
      index: FIRST_INTERFACE_INDEX + index,
      entries: entries
        .filter((entry) => entry.interfaceId === nic.id && entry.state === 'reachable' && entry.mac !== null)
        .filter((entry) => onlyIp === undefined || entry.ip === onlyIp)
        .sort((first, second) => (Ipv4.parse(first.ip) ?? 0) - (Ipv4.parse(second.ip) ?? 0))
        .map((entry) => ({ ip: entry.ip, mac: entry.mac ?? '', type: entry.type })),
    }))
  }
}
