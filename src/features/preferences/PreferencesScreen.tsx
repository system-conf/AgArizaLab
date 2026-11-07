import { useTranslation } from 'react-i18next'
import SiteHeader from '../layout/SiteHeader'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import PreferencesView from './PreferencesView'

/** `/preferences`: the Preferences screen (the workspace screens open the same view as a dialog). */
function PreferencesScreen() {
  const { t } = useTranslation('preferences')
  useDocumentMeta(t('title'))

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-fg-strong">{t('title')}</h1>
          <p className="text-sm text-fg-muted">{t('lead')}</p>
        </div>
        <PreferencesView className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm md:min-h-[32rem]" />
      </main>
    </div>
  )
}

export default PreferencesScreen
