import { useCallback, useContext, useSyncExternalStore } from 'react'
import { appPreferencesStore, PreferencesContext } from './preferencesContext'
import type { PreferencePath, Preferences, PreferenceValue } from './preferencesModel'
import type { PreferencesStore } from './PreferencesStore'

/** The provider's store, or the app store when there is no provider (e.g. a component test). */
export function usePreferencesStore(): PreferencesStore {
  return useContext(PreferencesContext) ?? appPreferencesStore()
}

/** All preferences; re-renders on any change. Prefer usePreference(path) for a single field. */
export function usePreferences(): Preferences {
  const store = usePreferencesStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/**
 * One field and its setter, like useState: `const [snap, setSnap] = usePreference('map.snap')`.
 * Re-renders only when that field changes; the setter saves and updates every tab.
 */
export function usePreference<P extends PreferencePath>(path: P): [PreferenceValue<P>, (value: PreferenceValue<P>) => void] {
  const store = usePreferencesStore()
  const read = useCallback(() => store.get(path), [store, path])
  const value = useSyncExternalStore(store.subscribe, read, read)
  const setValue = useCallback((next: PreferenceValue<P>) => store.set(path, next), [store, path])
  return [value, setValue]
}
