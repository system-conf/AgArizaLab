import type { AppearancePreferences, Theme } from './preferencesModel'
import type { PreferencesStore } from './PreferencesStore'

/** The query whose match means the operating system asks for a dark theme. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/** The parts of <html> the applier writes; injectable for tests. */
export interface ThemeRoot {
  readonly classList: Pick<DOMTokenList, 'toggle'>
  readonly style: { fontSize: string }
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** A MediaQueryList (or a test double) for DARK_SCHEME_QUERY. */
export interface ColorSchemeQuery {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

/**
 * Puts the appearance preferences on <html> (docs/PREFERENCES.md §4): class "dark" (Tailwind's dark
 * variant and the dark design tokens), data-density, data-contrast="more" and the root font size.
 * The inline script in index.html does the same before the first paint; keep the two in step
 * (ThemeApplier.test.ts runs both and compares).
 */
export class ThemeApplier {
  private readonly root: ThemeRoot
  private readonly darkQuery: ColorSchemeQuery | null

  constructor(root: ThemeRoot, darkQuery: ColorSchemeQuery | null) {
    this.root = root
    this.darkQuery = darkQuery
  }

  static fromBrowser(): ThemeApplier {
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : null
    return new ThemeApplier(document.documentElement, query)
  }

  /** 'system' follows the operating system; without a media query it is light. */
  static resolve(theme: Theme, systemDark: boolean): 'light' | 'dark' {
    if (theme === 'system') return systemDark ? 'dark' : 'light'
    return theme
  }

  apply(appearance: AppearancePreferences): void {
    const dark = ThemeApplier.resolve(appearance.theme, this.darkQuery?.matches ?? false) === 'dark'
    this.root.classList.toggle('dark', dark)
    this.root.setAttribute('data-density', appearance.density)
    if (appearance.highContrast) this.root.setAttribute('data-contrast', 'more')
    else this.root.removeAttribute('data-contrast')
    this.root.style.fontSize = appearance.fontScale === 1 ? '' : `${appearance.fontScale * 100}%`
  }

  /**
   * Applies the store's appearance now, after every change and whenever the system theme changes
   * (live, for 'system'). Returns the disconnect.
   */
  connect(store: PreferencesStore): () => void {
    let applied: AppearancePreferences | null = null
    const applyFromStore = () => {
      const appearance = store.getSnapshot().appearance
      if (appearance === applied) return
      applied = appearance
      this.apply(appearance)
    }
    const applyForSystemChange = () => this.apply(store.getSnapshot().appearance)
    applyFromStore()
    const unsubscribe = store.subscribe(applyFromStore)
    this.darkQuery?.addEventListener('change', applyForSystemChange)
    return () => {
      unsubscribe()
      this.darkQuery?.removeEventListener('change', applyForSystemChange)
    }
  }
}
