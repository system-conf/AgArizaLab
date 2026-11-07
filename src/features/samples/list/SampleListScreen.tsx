import { ListChecks } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../../i18n'
import { routes } from '../../../routing'
import LandingFooter from '../../landing/LandingFooter'
import SiteHeader from '../../layout/SiteHeader'
import { useDocumentMeta } from '../../layout/useDocumentMeta'
import { useNumberFormat } from '../../layout/useNumberFormat'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'
import { EMPTY_SAMPLE_FILTER, type SampleListFilter, type SampleListModel } from '../model/SampleListModel'
import SampleCard from './SampleCard'
import SampleFilterBar from './SampleFilterBar'

interface SampleListScreenProps {
  model: SampleListModel
}

/** `/samples`: what samples are, how many are finished, search and chips, cards grouped by category. */
function SampleListScreen({ model }: SampleListScreenProps) {
  const { t } = useTranslation('samples')
  const { language } = useLanguage()
  const formatNumber = useNumberFormat()
  const [filter, setFilter] = useState<SampleListFilter>(EMPTY_SAMPLE_FILTER)
  useDocumentMeta(t('ui.title'))
  const groups = model.filtered(filter, language)
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0)
  const { complete, total } = model.completion()
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0
  const progressParams = { complete: formatNumber(complete), total: formatNumber(total) }

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:py-10">
        <section aria-labelledby="sampleListTitle" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 id="sampleListTitle" className="text-2xl font-semibold text-fg-strong">
              {t('ui.title')}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-fg-muted sm:text-base">{t('ui.list.lead')}</p>
          </div>
          {total === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-fg-muted">{t('ui.list.empty')}</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-fg">{t('ui.list.progressLabel')}</span>
                  <span className="text-fg-muted">{t('ui.list.progress', progressParams)}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t('ui.list.progressLabel')}
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={complete}
                  aria-valuetext={t('ui.list.progress', progressParams)}
                  className="h-2.5 w-full overflow-hidden rounded-full bg-surface-strong"
                >
                  <div className="h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <p className="text-sm text-fg-subtle">{t('ui.list.hint')}</p>
              <SampleFilterBar filter={filter} levels={model.levels()} features={model.features()} onChange={setFilter} />
              <p role="status" className="text-sm text-fg-muted">
                {shown === 0 ? t('ui.list.noMatch') : t('ui.list.resultCount', { count: shown, formatted: formatNumber(shown) })}
              </p>
              {groups.map((group) => {
                const headingId = `sampleCategory-${group.category}`
                return (
                  <section key={group.category} aria-labelledby={headingId} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-0.5">
                      <h2 id={headingId} className="text-lg font-semibold text-fg-strong">
                        {t(`categories.${group.category}.title`)}
                      </h2>
                      <p className="text-sm text-fg-muted">{t(`categories.${group.category}.description`)}</p>
                    </div>
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <SampleCard item={item} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </>
          )}
          <p className="text-sm text-fg-muted">
            <AppLink
              to={routes.exercises}
              className={`inline-flex items-center gap-1.5 rounded font-medium text-accent-text underline-offset-2 hover:underline ${focusRing}`}
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              {t('ui.list.toExercises')}
            </AppLink>
          </p>
        </section>
        <LandingFooter />
      </main>
    </div>
  )
}

export default SampleListScreen
