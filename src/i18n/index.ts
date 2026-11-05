// i18n entry point: initializes i18next + react-i18next and exposes the small API the UI uses.
// Usage in components: `const { t } = useTranslation('device')` (react-i18next), and
// `useLanguage()` from here for the language switcher. See docs/I18N.md.
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next, useTranslation } from 'react-i18next'
import { LazyLocaleBackend } from './LazyLocaleBackend'
import { bundledResources } from './localeFiles'
import {
  fallbackLanguage,
  isLanguageCode,
  languageInfo,
  languages,
  toSupportedLanguage,
  type LanguageCode,
  type LanguageInfo,
} from './languages'
import { defaultNamespace, namespaces } from './namespaces'

export { languages, type LanguageCode, type LanguageInfo } from './languages'
export { translateMessage, useMessageTranslator, translateList } from './localizedMessage'
export { localizedMessage, type AppMessageKey } from './messageKeys'

/** localStorage key of the chosen language (written by the detector on every change). */
export const languageStorageKey = 'agArizaLab.language'

/** Keeps <html lang> and <html dir> in sync with the active language. */
function applyDocumentLanguage(language: string): void {
  if (typeof document === 'undefined') return
  const info = languageInfo(isLanguageCode(language) ? language : currentLanguage())
  document.documentElement.lang = info.code
  document.documentElement.dir = info.dir
}

/**
 * Initializes i18n once; resolves when the detected language's resources are ready, so the app
 * can render without a flash of raw keys. Safe to call again (returns immediately).
 */
export async function initI18n(): Promise<void> {
  if (i18n.isInitialized) return
  i18n.on('languageChanged', applyDocumentLanguage)
  await i18n
    .use(new LazyLocaleBackend())
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: bundledResources(),
      partialBundledLanguages: true,
      supportedLngs: languages.map((language) => language.code),
      fallbackLng: fallbackLanguage,
      load: 'currentOnly',
      ns: [...namespaces],
      defaultNS: defaultNamespace,
      interpolation: { escapeValue: false }, // React escapes already.
      returnNull: false,
      detection: {
        order: ['querystring', 'localStorage', 'navigator'],
        lookupQuerystring: 'lang',
        lookupLocalStorage: languageStorageKey,
        caches: ['localStorage'],
        convertDetectedLanguage: toSupportedLanguage,
      },
      react: { useSuspense: false },
    })
}

/** Active UI language (the resolved one, so never an unsupported code). */
export function currentLanguage(): LanguageCode {
  const resolved = i18n.resolvedLanguage ?? i18n.language
  return resolved !== undefined && isLanguageCode(resolved) ? resolved : fallbackLanguage
}

/** Switches the UI language, loading it first if needed; persisted in localStorage. */
export async function changeLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code)
}

export interface LanguageState {
  language: LanguageCode
  languages: readonly LanguageInfo[]
  changeLanguage: (code: LanguageCode) => Promise<void>
}

/** Current language + switcher data; re-renders the component when the language changes. */
export function useLanguage(): LanguageState {
  // Subscribes to 'languageChanged' so the returned language is always current.
  useTranslation()
  return { language: currentLanguage(), languages, changeLanguage }
}
