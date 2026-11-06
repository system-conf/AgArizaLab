// Physical state of a device's ports as the CLI reports it (`%LINK-…` messages, interface status).
import type { Device, NetworkState } from '../../domain'
import { Topology } from '../../net/Topology'

export class LinkStatus {
  /** The network with `device` in place of its stored copy (handlers see the edited device first). */
  static withDevice(network: NetworkState, device: Device): NetworkState {
    const known = network.devices.some((candidate) => candidate.id === device.id)
    const devices = known ? network.devices.map((candidate) => (candidate.id === device.id ? device : candidate)) : [...network.devices, device]
    return { ...network, devices }
  }

  /** Port is admin up and a cable on it carries traffic (both ends powered and up). */
  static portUp(network: NetworkState, device: Device, portId: string): boolean {
    const port = device.ports.find((candidate) => candidate.id === portId)
    if (port === undefined || !port.adminUp || !device.powered) return false
    const topology = Topology.of(LinkStatus.withDevice(network, device))
    return topology.linksAt(device.id, portId).some((link) => topology.isUp(link))
  }
}
