import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../routing'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'

/** Link card to the sample labs (`/samples`), e.g. under the exercises. Main chunk: keep it light. */
function SamplesCallout() {
  const { t } = useTranslation('samples')
  return (
    <AppLink
      to={routes.samples}
      className={`flex items-center gap-3 rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 p-4 text-teal-950 dark:text-teal-200 shadow-sm hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-100 dark:hover:bg-teal-900/40 ${focusRing}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
        <BookOpen className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{t('ui.callout.title')}</span>
        <span className="text-sm text-teal-900 dark:text-teal-200">{t('ui.callout.text')}</span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
    </AppLink>
  )
}

export default SamplesCallout
