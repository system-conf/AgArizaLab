/**
 * Why a v1 state cannot be migrated without losing data. v1 states only come from code (exercises,
 * test fixtures), so this is a programmer error and is thrown, never shown to users.
 */
export type V1MigrationErrorCode =
  /** A link names a device that is not in the state. */
  | 'unknownDevice'
  /** Two links end on one v2 port that takes a single cable. */
  | 'portShared'
  /** A settings bag on a device kind that has no place for it in v2 (e.g. appLinks on a switch). */
  | 'unsupportedSetting'

export class V1MigrationError extends Error {
  readonly code: V1MigrationErrorCode

  constructor(code: V1MigrationErrorCode, detail: string) {
    super(`Cannot migrate v1 state: ${code} (${detail})`)
    this.name = 'V1MigrationError'
    this.code = code
  }
}
