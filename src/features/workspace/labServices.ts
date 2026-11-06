// The workspace's only door to the neighbouring modules (lab core, catalog, engine, exercise locks).
// Components and hooks import from here, so an API change of a neighbour touches one file.
import type { LinkLight } from '../../domain/EngineContract'
import type { AppLinkStatusV2, CommandResultV2, DeviceV2, NetworkStateV2 } from '../../domain/v2'
import { networkEngineV2, TerminalAvailabilityV2 } from '../../engine'

export {
  clearShareHash,
  createEmptyLab,
  deleteRecentLab,
  exportLabFile,
  importLabFile,
  isLabStorageAvailable,
  LAB_FILE_ACCEPT,
  labEditor,
  labFileName,
  LabMessages,
  labShareLink,
  listRecentLabs,
  loadAutosave,
  markLabOpened,
  openRecentLab,
  saveLabAsNew,
  useLabDocument,
  type DeviceMove,
  type LabDocumentState,
  type LabEditor,
  type LabParseResult,
} from '../../lab'
export { DEVICE_CATEGORIES, DeviceKindIcon, deviceCatalog, findDeviceModel, PortFactory } from '../../catalog'
export { ExerciseLockPolicy, type EditAccess } from '../../session/ExerciseLockPolicy'

/** Physical link light of a cable (engine: plugged, powered, admin up, SSID offered, pinouts…). */
export function linkLightOf(network: NetworkStateV2, linkId: string): LinkLight {
  return networkEngineV2.linkLight(network, linkId)
}

/** Runs a command prompt line on a device (v2 engine): output lines, changed network, ping / tracert trace. */
export function runDeviceCommand(network: NetworkStateV2, deviceId: string, commandLine: string): CommandResultV2 {
  return networkEngineV2.runCommand(network, deviceId, commandLine)
}

/** Whether the device has a command prompt (computers, POS terminals, servers, NVRs). */
export function hasTerminal(device: DeviceV2): boolean {
  return TerminalAvailabilityV2.isAvailable(device)
}

/** Whether each application link of an end device works (green / red with the failure reason). */
export function appLinkStatusOf(network: NetworkStateV2, deviceId: string): AppLinkStatusV2[] {
  return networkEngineV2.appLinkStatus(network, deviceId)
}
