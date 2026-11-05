// The workspace's only door to the other wave-2.1 modules (lab core B2, catalog C1, engine E2).
// Components and hooks import from here, so an API change of a neighbour touches one file.
import type { LinkLight } from '../../domain/EngineContract'
import type { NetworkStateV2 } from '../../domain/v2'
import { networkEngineV2 } from '../../engine'

export {
  createEmptyLab,
  labEditor,
  loadAutosave,
  useLabDocument,
  type DeviceMove,
  type LabDocumentState,
  type LabEditor,
} from '../../lab'
export { DEVICE_CATEGORIES, DeviceKindIcon, deviceCatalog, findDeviceModel, PortFactory } from '../../catalog'

/** Physical link light of a cable (engine: plugged, powered, admin up, SSID offered, pinouts…). */
export function linkLightOf(network: NetworkStateV2, linkId: string): LinkLight {
  return networkEngineV2.linkLight(network, linkId)
}
