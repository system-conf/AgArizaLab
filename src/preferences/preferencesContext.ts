import { createContext } from 'react'
import { PreferencesStore } from './PreferencesStore'

/** The store PreferencesProvider hands down; null outside a provider (hooks then use the app store). */
export const PreferencesContext = createContext<PreferencesStore | null>(null)

let appStore: PreferencesStore | null = null

/** The app's one store over localStorage, created on first use. */
export function appPreferencesStore(): PreferencesStore {
  appStore ??= PreferencesStore.fromBrowser()
  return appStore
}
