// Teaching notes of the services layer (`simulation:notes.services.*`, docs/SIMULATION.md §3.1).
import type { LocalizedMessage } from '../../domain/Messages'
import { type AppMessageKey, localizedMessage } from '../../i18n/messageKeys'
import type { EventBuilder, NoteDirection, OsiLayer } from '../contract'

const PREFIX = 'simulation:notes.services.'

/** Names of the keys under `simulation:notes.services` (checked against the en locale file). */
export type ServiceNoteName = AppMessageKey extends infer Key
  ? Key extends `${typeof PREFIX}${infer Name}`
    ? Name
    : never
  : never

/** Builds the localized notes of the services layer. */
export class ServiceNotes {
  static message(name: ServiceNoteName, params?: Record<string, string | number>): LocalizedMessage {
    return localizedMessage(`${PREFIX}${name}`, params)
  }

  /** Adds a note to an event (layer 7 unless named). */
  static add(
    event: EventBuilder,
    direction: NoteDirection,
    name: ServiceNoteName,
    params?: Record<string, string | number>,
    layer: OsiLayer = 7,
  ): void {
    event.note(layer, direction, ServiceNotes.message(name, params))
  }
}
