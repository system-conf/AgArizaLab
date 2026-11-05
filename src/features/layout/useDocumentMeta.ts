import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../i18n'

/** Region used for the Open Graph locale (`language_REGION`); languages without one use the bare code. */
const openGraphRegions: Readonly<Record<string, string>> = { tr: 'TR', en: 'US' }

function openGraphLocale(code: string): string {
  const region = openGraphRegions[code]
  return region === undefined ? code : `${code}_${region}`
}

function setMetaContent(selector: string, content: string): void {
  document.querySelector(selector)?.setAttribute('content', content)
}

/** Replaces every og:locale:alternate tag with one per given locale. */
function setAlternateLocales(locales: readonly string[]): void {
  document.querySelectorAll('meta[property="og:locale:alternate"]').forEach((element) => element.remove())
  for (const locale of locales) {
    const element = document.createElement('meta')
    element.setAttribute('property', 'og:locale:alternate')
    element.setAttribute('content', locale)
    document.head.append(element)
  }
}

/**
 * Keeps document.title, the meta description and the Open Graph title / description / locale
 * (plus the alternate locales) in the active language. `pageTitle` (e.g. the open exercise) is
 * prefixed to the app name; omit it on the landing page.
 */
export function useDocumentMeta(pageTitle?: string): void {
  const { t } = useTranslation('common')
  const { language, languages } = useLanguage()
  const title = pageTitle === undefined ? t('meta.title') : t('meta.pageTitle', { page: pageTitle, appName: t('appName') })
  const description = t('meta.description')

  useEffect(() => {
    document.title = title
    setMetaContent('meta[name="description"]', description)
    setMetaContent('meta[property="og:title"]', title)
    setMetaContent('meta[property="og:description"]', description)
    setMetaContent('meta[property="og:locale"]', openGraphLocale(language))
    setAlternateLocales(
      languages.filter((candidate) => candidate.code !== language).map((candidate) => openGraphLocale(candidate.code)),
    )
  }, [title, description, language, languages])
}
