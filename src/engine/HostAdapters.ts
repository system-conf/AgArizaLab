import type { Device, NetworkState } from '../domain'
import { HostAttachment } from '../net/HostAttachment'
import type { L3Interface } from '../net/L3Interfaces'
import { Topology } from '../net/Topology'
import type { AdapterView } from './CommandFormatter'

/**
 * The adapters ipconfig lists for a host (one per active NIC), shared by the rule engine's shell and the
 * simulator's terminal. Only the duplicate-address check differs: the engine looks at the segment, the
 * simulator at its duplicate-address probes; it is asked only for a connected, powered, addressed NIC.
 */
export class HostAdapters {
  static views(state: NetworkState, deviceId: string, isDuplicate: (nic: L3Interface) => boolean): AdapterView[] {
    const topology = Topology.of(state)
    const device = topology.require(deviceId)
    return HostAttachment.activeNics(topology, device).map((nic) => HostAdapters.view(topology, device, nic, isDuplicate))
  }

  /** Windows names the adapter "Wi-Fi" in its error texts for a wireless NIC. */
  static isWireless(device: Device, portId: string | undefined): boolean {
    return device.ports.find((port) => port.id === portId)?.medium === 'wireless'
  }

  private static view(topology: Topology, device: Device, nic: L3Interface, isDuplicate: (nic: L3Interface) => boolean): AdapterView {
    const connected = HostAttachment.attach(topology, nic).ok
    const port = device.ports.find((candidate) => candidate.id === nic.portId)
    return {
      hostName: device.id.toUpperCase(),
      wireless: HostAdapters.isWireless(device, nic.portId),
      connected,
      mac: port?.mac ?? device.baseMac,
      host: {
        mode: nic.addressing,
        ip: nic.address,
        mask: nic.mask,
        gateway: device.host?.defaultGateway ?? '',
        dns: device.host?.dnsServers ?? [],
      },
      duplicateAddress: connected && device.powered && nic.address !== '' && isDuplicate(nic),
    }
  }
}
