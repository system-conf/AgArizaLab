import { ArrowRight, PencilRuler } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../../routing'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'

/** Link card to the design tasks (`/design`), e.g. under the troubleshooting exercises. Main chunk: keep it light. */
function DesignTasksCallout() {
  const { t } = useTranslation('design')
  return (
    <AppLink
      to={routes.designs}
      className={`flex items-center gap-3 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 p-4 text-indigo-950 dark:text-indigo-200 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 ${focusRing}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
        <PencilRuler className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{t('ui.list.fromExercises')}</span>
        <span className="text-sm text-indigo-900 dark:text-indigo-200">{t('ui.landing.text')}</span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
    </AppLink>
  )
}

export default DesignTasksCallout
