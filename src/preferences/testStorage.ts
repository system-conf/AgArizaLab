import type { PreferencesStorage } from './PreferencesStore'

/** A Map-backed Storage double for the preferences tests. */
export function memoryStorage(initial: Record<string, string> = {}): PreferencesStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}
