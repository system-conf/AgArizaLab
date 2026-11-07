import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../../routing'
import LandingFooter from '../../landing/LandingFooter'
import SiteHeader from '../../layout/SiteHeader'
import { useDocumentMeta } from '../../layout/useDocumentMeta'
import { useNumberFormat } from '../../layout/useNumberFormat'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'
import DesignBriefCard from './DesignBriefCard'
import type { DesignListItem } from './designListItem'

interface DesignListScreenProps {
  items: DesignListItem[]
  onStart: (briefId: string) => void
}

/** `/design`: what design tasks are, how many are solved and one card per brief. */
function DesignListScreen({ items, onStart }: DesignListScreenProps) {
  const { t } = useTranslation('design')
  const formatNumber = useNumberFormat()
  useDocumentMeta(t('ui.list.title'))
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const solved = items.filter((item) => item.state === 'solved').length
  const percent = items.length > 0 ? Math.round((solved / items.length) * 100) : 0
  const params = { solved: formatNumber(solved), total: formatNumber(items.length) }

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:py-10">
        <section aria-labelledby="designListTitle" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 id="designListTitle" className="text-2xl font-semibold text-fg-strong">
              {t('ui.list.title')}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-fg-muted sm:text-base">{t('ui.list.lead')}</p>
          </div>
          <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-fg">{t('ui.list.progressLabel')}</span>
              <span className="text-fg-muted">{t('ui.list.progress', params)}</span>
            </div>
            <div
              role="progressbar"
              aria-label={t('ui.list.progressLabel')}
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={solved}
              aria-valuetext={t('ui.list.progress', params)}
              className="h-2.5 w-full overflow-hidden rounded-full bg-surface-strong"
            >
              <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <p className="text-sm text-fg-subtle">{t('ui.list.hint')}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((item) => (
              <li key={item.id}>
                <DesignBriefCard item={item} onStart={onStart} />
              </li>
            ))}
          </ul>
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

export default DesignListScreen
