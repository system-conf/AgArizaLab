// Root of the v2 network model: what the engine reads and what a lab stores (docs/MODEL_V2.md §1).
import type { Device } from './DeviceTypes'
import type { Link } from './LinkTypes'

/**
 * Devices and links only. Positions, notes and annotations live in the LabDocument, so the engine
 * never depends on the canvas. Treated as immutable everywhere.
 */
export interface NetworkState {
  devices: Device[]
  links: Link[]
}
