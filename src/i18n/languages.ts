// The single list of UI languages. Adding a language = add src/locales/<code>/ (every namespace,
// same keys as en) + one line here. No other code change (see docs/I18N.md).

export type TextDirection = 'ltr' | 'rtl'

export interface LanguageInfo {
  /** BCP 47 code, also the folder name under src/locales/. */
  code: string
  /** Name of the language in that language, shown in the language switcher. */
  nativeName: string
  dir: TextDirection
}

export const languages = [
  { code: 'tr', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'en', nativeName: 'English', dir: 'ltr' },
] as const satisfies readonly LanguageInfo[]

export type LanguageCode = (typeof languages)[number]['code']

/** Fallback language: its files define the key set every other language must match. */
export const fallbackLanguage: LanguageCode = 'en'

export function isLanguageCode(value: string): value is LanguageCode {
  return languages.some((language) => language.code === value)
}

export function languageInfo(code: LanguageCode): LanguageInfo {
  const info = languages.find((language) => language.code === code)
  if (!info) throw new Error(`Unknown language code: ${code}`)
  return info
}

/**
 * Maps a detected browser / URL language to a supported code: exact match first, then the base
 * language ('tr-TR' → 'tr'). Unsupported values are returned unchanged so i18next skips them
 * and falls back to the next detector or to `fallbackLanguage`.
 */
export function toSupportedLanguage(detected: string): string {
  const normalized = detected.trim().replace('_', '-')
  const exact = languages.find((language) => language.code.toLowerCase() === normalized.toLowerCase())
  if (exact) return exact.code
  const base = normalized.split('-')[0]?.toLowerCase() ?? ''
  const byBase = languages.find((language) => language.code.toLowerCase() === base)
  return byBase ? byBase.code : normalized
}
