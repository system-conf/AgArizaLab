import type { DeviceV2 } from '../../../domain/v2'
import type { LocalizedMessage } from '../../../domain/Messages'
import type { ConfigAccess } from '../model/ConfigLocks'

/** Props of every settings card. Hidden cards are never rendered, so `access` is never 'hidden' here. */
export interface SectionProps {
  device: DeviceV2
  access: ConfigAccess
  /** Show the "Saved" confirmation of this card. */
  saved: boolean
  /** The whole edited device; the panel hands it to its parent. Never mutate `device`. */
  onSave: (next: DeviceV2) => void
}

/** Grid for form fields: one column on phones, two when the panel is wide enough. */
export const fieldGrid = 'grid gap-3 @md:grid-cols-2'

/** Translates a validation message once errors are shown (see useShownErrors). */
export type ShowError = (message: LocalizedMessage | undefined) => string | undefined
