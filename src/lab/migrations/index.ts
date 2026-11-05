// v1 → v2 migration (docs/MODEL_V2.md §11). Later lab-file migrations (schemaVersion 2 → 3 …) live
// next to it and are chained by the LabSerializer (src/lab, B2).
export { migrateV1Exercise, migrateV1Layout, migrateV1ToV2, V1ToV2Migration } from './V1ToV2Migration'
export { V1MigrationError, type V1MigrationErrorCode } from './V1MigrationError'
export { V1_DEVICE_MAP, V1_MODEL_IDS, V1_POE_SWITCH_MODEL_ID, V1_SETTING_MAP } from './v1DeviceMap'
export { V1_DNS_FORWARDER } from './V1SettingsMigrator'
export {
  AP_RADIO_PORT,
  AP_UPLINK_PORT,
  CLOUD_MIN_PORTS,
  CONSOLE_PORT,
  ROUTER_LAN_PORT,
  ROUTER_WAN_PORT,
} from './V1PortMigrator'
