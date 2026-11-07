import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import { DEFAULT_PREFERENCES, FONT_SCALES, type AppearancePreferences } from './preferencesModel'
import { PreferencesStore } from './PreferencesStore'
import { memoryStorage } from './testStorage'
import { ThemeApplier, type ColorSchemeQuery, type ThemeRoot } from './ThemeApplier'

interface RootState {
  dark: boolean
  attributes: Record<string, string>
  fontSize: string
}

class FakeRoot implements ThemeRoot {
  readonly classes = new Set<string>()
  readonly attributes = new Map<string, string>()
  readonly style = { fontSize: '' }
  readonly classList = {
    toggle: (name: string, force?: boolean): boolean => {
      const on = force ?? !this.classes.has(name)
      if (on) this.classes.add(name)
      else this.classes.delete(name)
      return on
    },
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  state(): RootState {
    return { dark: this.classes.has('dark'), attributes: Object.fromEntries(this.attributes), fontSize: this.style.fontSize }
  }
}

class FakeQuery implements ColorSchemeQuery {
  matches: boolean
  private readonly listeners = new Set<() => void>()

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener)
  }

  change(matches: boolean): void {
    this.matches = matches
    this.listeners.forEach((listener) => listener())
  }

  listenerCount(): number {
    return this.listeners.size
  }
}

const base = DEFAULT_PREFERENCES.appearance
const DEFAULT_STATE: RootState = { dark: false, attributes: { 'data-density': 'comfortable' }, fontSize: '' }

function look(change: Partial<AppearancePreferences>): AppearancePreferences {
  return { ...base, ...change }
}

/** Runs the early script of index.html against a fake <html> and returns what it set. */
function runBootScript(stored: string | null, systemDark: boolean): RootState {
  const match = /<script id="preferencesBoot">([\s\S]*?)<\/script>/.exec(indexHtml)
  if (match?.[1] === undefined) throw new Error('index.html has no preferencesBoot script')
  const root = new FakeRoot()
  const run = new Function('document', 'localStorage', 'matchMedia', 'console', match[1])
  run(
    { documentElement: root },
    { getItem: () => stored },
    (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' && systemDark }),
    { warn: () => undefined },
  )
  return root.state()
}

describe('ThemeApplier', () => {
  it('resolves the theme', () => {
    expect(ThemeApplier.resolve('light', true)).toBe('light')
    expect(ThemeApplier.resolve('dark', false)).toBe('dark')
    expect(ThemeApplier.resolve('system', true)).toBe('dark')
    expect(ThemeApplier.resolve('system', false)).toBe('light')
  })

  it('keeps the current look for the defaults', () => {
    const root = new FakeRoot()
    new ThemeApplier(root, new FakeQuery(true)).apply(base)
    expect(root.state()).toEqual(DEFAULT_STATE)
  })

  it('sets the dark class, density, contrast and font size', () => {
    const root = new FakeRoot()
    const applier = new ThemeApplier(root, null)
    applier.apply(look({ theme: 'dark', density: 'compact', highContrast: true, fontScale: 1.25 }))
    expect(root.state()).toEqual({ dark: true, attributes: { 'data-density': 'compact', 'data-contrast': 'more' }, fontSize: '125%' })
    applier.apply(base)
    expect(root.state()).toEqual(DEFAULT_STATE)
  })

  it('follows the store and, for system, the operating system live', () => {
    const root = new FakeRoot()
    const query = new FakeQuery(false)
    const store = new PreferencesStore(memoryStorage())
    const disconnect = new ThemeApplier(root, query).connect(store)
    expect(root.state().dark).toBe(false)
    store.set('appearance.theme', 'system')
    expect(root.state().dark).toBe(false)
    query.change(true)
    expect(root.state().dark).toBe(true)
    store.set('appearance.theme', 'light')
    expect(root.state().dark).toBe(false)
    disconnect()
    expect(query.listenerCount()).toBe(0)
    store.set('appearance.theme', 'dark')
    expect(root.state().dark).toBe(false)
  })

  describe('index.html early script', () => {
    const cases: [string, Partial<AppearancePreferences>, boolean][] = [
      ['defaults', {}, true],
      ['dark', { theme: 'dark' }, false],
      ['system, dark OS', { theme: 'system' }, true],
      ['system, light OS', { theme: 'system' }, false],
      ['compact, high contrast', { density: 'compact', highContrast: true }, false],
      ...FONT_SCALES.map((fontScale): [string, Partial<AppearancePreferences>, boolean] => [`font ${fontScale}`, { fontScale }, false]),
    ]

    it.each(cases)('matches ThemeApplier: %s', (_name, change, systemDark) => {
      const root = new FakeRoot()
      new ThemeApplier(root, new FakeQuery(systemDark)).apply(look(change))
      expect(runBootScript(JSON.stringify({ version: 1, appearance: change }), systemDark)).toEqual(root.state())
    })

    it('applies the defaults for nothing stored or junk', () => {
      expect(runBootScript(null, true)).toEqual(DEFAULT_STATE)
      expect(runBootScript('null', true)).toEqual(DEFAULT_STATE)
      expect(runBootScript('{"appearance":{"theme":"neon","fontScale":9}}', true)).toEqual(DEFAULT_STATE)
      expect(runBootScript('{broken', true)).toEqual({ dark: false, attributes: {}, fontSize: '' })
    })
  })
})
