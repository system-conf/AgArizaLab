// Lab core (B2): lab documents, editing, undo / redo, persistence, files and share links.
export { createEmptyLab, createLabFromExercise, createLabFromState, type CreateLabOptions } from './createLab'
export {
  LabEditError,
  LabEditor,
  labEditor,
  type DeviceMove,
  type DeviceMoves,
  type LabConnectResult,
  type LabMetaChanges,
} from './LabEditor'
export { DEFAULT_HISTORY_LIMIT, LabHistory } from './LabHistory'
export { LabMessages, MAX_REPORTED_ERRORS } from './LabMessages'
export { LAB_MIGRATION_STEPS, LabMigrationChain, type LabMigrationStep, type LabOrigin, type LabUpgrade } from './LabMigrationChain'
export { LabSerializer, labSerializer, type LabParseResult } from './LabSerializer'
export {
  clearShareHash,
  LabShareLink,
  labShareLink,
  MAX_SHARE_HASH_LENGTH,
  readSharedLabFromLocation,
  SHARE_HASH_PREFIX,
  type ShareHashResult,
  type ShareUrlResult,
} from './LabShareLink'
export { exportLabFile, importLabFile, LAB_FILE_ACCEPT, LAB_FILE_EXTENSION, labFileName } from './labFiles'
export { labDocumentSchema } from './schemas/labDocumentSchema'
export { AUTOSAVE_DELAY_MS, LabAutosaver, type DelayScheduler } from './storage/LabAutosaver'
export {
  IdbKeyValueStore,
  MemoryKeyValueStore,
  ResilientKeyValueStore,
  type LabKeyValueStore,
} from './storage/LabKeyValueStore'
export { LabLibrary, MAX_RECENT_LABS, newLabId, type RecentLabEntry, type StoredLab } from './storage/LabLibrary'
export {
  deleteRecentLab,
  isLabStorageAvailable,
  labLibrary,
  listRecentLabs,
  loadAutosave,
  openRecentLab,
} from './storage/labStorage'
export {
  useLabDocument,
  type ApplyOptions,
  type LabDocumentState,
  type ReplaceOptions,
  type UseLabDocumentOptions,
} from './useLabDocument'
