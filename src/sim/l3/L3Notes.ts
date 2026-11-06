// Teaching notes of the network layer (`simulation:notes.l3.*`, docs/SIMULATION.md §3.1): one line of
// the OSI explanation per decision. Keys are checked against src/locales/en/simulation.json at compile time.
import type { LocalizedMessage } from '../../domain/Messages'
import { type AppMessageKey, localizedMessage } from '../../i18n/messageKeys'

/** Every key under `simulation:notes.l3`. */
export type L3NoteKey = AppMessageKey extends infer Key ? (Key extends `simulation:notes.l3.${infer Name}` ? Name : never) : never

export class L3Notes {
  static of(key: L3NoteKey, params?: Record<string, string | number>): LocalizedMessage {
    return localizedMessage(`simulation:notes.l3.${key}`, params)
  }
}
