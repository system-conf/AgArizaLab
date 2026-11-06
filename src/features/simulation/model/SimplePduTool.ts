import type { Device } from '../../../domain'
import type { SimPingRequest } from '../simulationServices'

/** Packet Tracer's "Add Simple PDU": click the source, then the destination; one echo request is queued. */
export type PduToolState =
  | { readonly kind: 'off' }
  | { readonly kind: 'source' }
  | { readonly kind: 'destination'; readonly sourceId: string }

export type PduToolOutcome =
  | { readonly kind: 'next'; readonly state: PduToolState }
  | { readonly kind: 'inject'; readonly state: PduToolState; readonly request: SimPingRequest; readonly targetIp: string }
  | { readonly kind: 'refused'; readonly state: PduToolState; readonly reason: 'noAddress' | 'sameDevice' }

/** Windows ping's default data size. */
const SIMPLE_PDU_BYTES = 32

export const PDU_TOOL_OFF: PduToolState = { kind: 'off' }

export class SimplePduTool {
  static start(): PduToolState {
    return { kind: 'source' }
  }

  static isActive(state: PduToolState): boolean {
    return state.kind !== 'off'
  }

  /**
   * A device was clicked. Any device may be the source (one without an address shows its local
   * failure, which is a lesson too); the destination needs an address to ping, its first one is used.
   */
  static click(state: PduToolState, device: Device, addressesOf: (device: Device) => readonly string[]): PduToolOutcome {
    switch (state.kind) {
      case 'off':
        return { kind: 'next', state }
      case 'source':
        return { kind: 'next', state: { kind: 'destination', sourceId: device.id } }
      case 'destination': {
        if (device.id === state.sourceId) return { kind: 'refused', state, reason: 'sameDevice' }
        const targetIp = addressesOf(device)[0]
        if (targetIp === undefined) return { kind: 'refused', state, reason: 'noAddress' }
        const request: SimPingRequest = { kind: 'ping', deviceId: state.sourceId, targetIp, count: 1, size: SIMPLE_PDU_BYTES }
        return { kind: 'inject', state: PDU_TOOL_OFF, request, targetIp }
      }
    }
  }

  /** Escape: from the destination step back to the source step, from there off. */
  static back(state: PduToolState): PduToolState {
    return state.kind === 'destination' ? { kind: 'source' } : PDU_TOOL_OFF
  }
}
