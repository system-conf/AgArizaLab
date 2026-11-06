import { type L3Interface } from './L3Interfaces'
import type { Topology } from './Topology'
import { VlanRules } from './VlanRules'

/** Operational state of a layer-3 interface (shared by the rule engine's routing table and the simulator). */
export class InterfaceStatus {
  /** Is the interface operational: powered device, admin up, port link up (SVI: VLAN active)? */
  static isUp(topology: Topology, iface: L3Interface): boolean {
    const device = topology.find(iface.deviceId)
    if (!device?.powered || !iface.adminUp) return false
    if (iface.kind === 'svi') return VlanRules.inDatabase(device, iface.vlan ?? 0)
    const port = device.ports.find((candidate) => candidate.id === iface.portId)
    if (!port?.adminUp || iface.portId === undefined) return false
    return topology.linksAt(device.id, iface.portId).some((link) => topology.isUp(link))
  }
}
