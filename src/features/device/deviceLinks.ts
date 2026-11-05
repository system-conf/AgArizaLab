import type { Device, Link, NetworkState } from '../../domain/NetworkTypes'

/** A link seen from one device: its own port and the device on the other end. */
export interface DeviceLinkView {
  link: Link
  ownPortId: string
  peer: Device | undefined
  peerPortId: string
}

/** Lists every link that touches `deviceId`, oriented from that device's side. */
export function linksOfDevice(state: NetworkState, deviceId: string): DeviceLinkView[] {
  return state.links
    .filter((link) => link.a.deviceId === deviceId || link.b.deviceId === deviceId)
    .map((link) => {
      const own = link.a.deviceId === deviceId ? link.a : link.b
      const other = own === link.a ? link.b : link.a
      return {
        link,
        ownPortId: own.portId,
        peer: state.devices.find((device) => device.id === other.deviceId),
        peerPortId: other.portId,
      }
    })
}
