import { useEffect, useState, type ReactNode } from 'react'
import { appPreferencesStore, PreferencesContext } from './preferencesContext'
import type { PreferencesStore } from './PreferencesStore'
import { ThemeApplier } from './ThemeApplier'

interface PreferencesProviderProps {
  /** Defaults to the app store over localStorage; tests pass their own. */
  store?: PreferencesStore
  children: ReactNode
}

/**
 * Hands the preferences store down, applies the appearance to <html> (theme, density, contrast, font
 * size) and follows changes made in other tabs. Mounted once around the app in main.tsx.
 */
function PreferencesProvider({ store: given, children }: PreferencesProviderProps) {
  const [store] = useState(() => given ?? appPreferencesStore())

  useEffect(() => {
    const disconnectTabs = store.listenToOtherTabs(window)
    const disconnectTheme = ThemeApplier.fromBrowser().connect(store)
    return () => {
      disconnectTabs()
      disconnectTheme()
    }
  }, [store])

  return <PreferencesContext value={store}>{children}</PreferencesContext>
}

export default PreferencesProvider
