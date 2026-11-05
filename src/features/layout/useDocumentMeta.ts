import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Keeps document.title and the meta description in the active language.
 * `pageTitle` (e.g. the open exercise) is prefixed to the app name; omit it on the landing page.
 */
export function useDocumentMeta(pageTitle?: string): void {
  const { t } = useTranslation('common')
  const title = pageTitle === undefined ? t('meta.title') : t('meta.pageTitle', { page: pageTitle, appName: t('appName') })
  const description = t('meta.description')

  useEffect(() => {
    document.title = title
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
  }, [title, description])
}
