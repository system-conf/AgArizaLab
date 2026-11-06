// v1 → v2 tables for kinds, catalog models and exercise settings (docs/MODEL_V2.md §11).
import type { V1DeviceKind, V1ScenarioSetting } from './v1Types'
import type { DeviceKind, ExerciseSetting } from '../../domain'

export interface V1DeviceMapping {
  kind: DeviceKind
  modelId: string
}

export const V1_DEVICE_MAP: Readonly<Record<V1DeviceKind, V1DeviceMapping>> = {
  internet: { kind: 'internet', modelId: 'internetCloud' },
  router: { kind: 'router', modelId: 'router2Port' },
  switch: { kind: 'switch', modelId: 'switch8' },
  accessPoint: { kind: 'accessPoint', modelId: 'accessPoint' },
  pc: { kind: 'pc', modelId: 'pc' },
  pos: { kind: 'pos', modelId: 'pos' },
  printer: { kind: 'printer', modelId: 'printer' },
  camera: { kind: 'camera', modelId: 'ipCamera' },
  nvr: { kind: 'nvr', modelId: 'nvr' },
  kitchenDisplay: { kind: 'kitchenDisplay', modelId: 'kitchenDisplay' },
  phone: { kind: 'smartphone', modelId: 'smartphone' },
}

/** A v1 switch with at least one PoE port becomes this model instead of 'switch8'. */
export const V1_POE_SWITCH_MODEL_ID = 'switch8Poe'

/** Every model id the migration can produce. The catalog (src/catalog, C1) must contain all of them. */
export const V1_MODEL_IDS: readonly string[] = [
  ...new Set([...Object.values(V1_DEVICE_MAP).map((mapping) => mapping.modelId), V1_POE_SWITCH_MODEL_ID]),
]

export const V1_SETTING_MAP: Readonly<Record<V1ScenarioSetting, ExerciseSetting>> = {
  restoran: 'restaurant',
  ofis: 'office',
  magaza: 'shop',
}

/** v1 end-device kinds: they have `host` settings and eth0 / wlan0. */
export const V1_HOST_KINDS: readonly V1DeviceKind[] = ['pc', 'pos', 'printer', 'camera', 'nvr', 'kitchenDisplay', 'phone']
