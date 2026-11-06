import type { CableType, DeviceKind, DeviceModel, Link, NetworkState } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'

/** Infrastructure first, then end devices: the order of "devices by type" lists. */
const KIND_ORDER: Record<DeviceKind, number> = {
  internet: 0,
  router: 1,
  wirelessRouter: 2,
  l3Switch: 3,
  switch: 4,
  hub: 5,
  accessPoint: 6,
  server: 7,
  nvr: 8,
  pc: 9,
  laptop: 10,
  printer: 11,
  ipPhone: 12,
  pos: 13,
  kitchenDisplay: 14,
  camera: 15,
  smartphone: 16,
  tablet: 17,
}

/** Shared labels and names of the review and the handover pack (texts of other namespaces are read, not owned). */
export class DesignLabels {
  static kind(kind: DeviceKind): LocalizedMessage {
    return localizedMessage(`catalog:kinds.${kind}`)
  }

  static cable(cable: CableType): LocalizedMessage {
    return localizedMessage(`workspace:cableTools.${cable}`)
  }

  /** Catalog name of a model; unknown models (removed from the catalog) show their id. */
  static model(modelId: string, findModel: (modelId: string) => DeviceModel | undefined): LocalizedMessage | string {
    const model = findModel(modelId)
    return model ? { key: model.nameKey } : modelId
  }

  static compareKinds(a: DeviceKind, b: DeviceKind): number {
    return KIND_ORDER[a] - KIND_ORDER[b]
  }

  /** Display name of a device; falls back to the id so a text is never empty. */
  static deviceName(state: NetworkState, deviceId: string): string {
    return state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  }

  /** Names of both ends of a link (ids when the link or a device is gone). */
  static linkEnds(state: NetworkState, linkId: string): { a: string; b: string } {
    const link: Link | undefined = state.links.find((candidate) => candidate.id === linkId)
    if (!link) return { a: linkId, b: linkId }
    return { a: DesignLabels.deviceName(state, link.a.deviceId), b: DesignLabels.deviceName(state, link.b.deviceId) }
  }
}
