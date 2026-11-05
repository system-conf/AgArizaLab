import { ArrowDown, CodeXml } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { siteInfo } from '../layout/siteInfo'
import { focusRing } from '../shared/focusRing'
import ProgressBar from './ProgressBar'

interface LandingHeroProps {
  completed: number
  total: number
  /** Id of the exercise list section, target of the "go to exercises" link. */
  exercisesAnchorId: string
}

/** Top of the start page: what the lab is, a light note on what comes next, progress and calls to action. */
function LandingHero({ completed, total, exercisesAnchorId }: LandingHeroProps) {
  const { t } = useTranslation(['landing', 'common'])

  return (
    <section
      aria-labelledby="landingHeroTitle"
      className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-sky-800 to-slate-900 px-5 py-8 text-white shadow-lg sm:px-8 sm:py-10"
    >
      <div className="flex flex-col gap-3">
        <h1 id="landingHeroTitle" className="text-2xl font-semibold leading-tight sm:text-4xl">
          {t('hero.title')}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-sky-100 sm:text-base">{t('hero.lead')}</p>
        <p className="max-w-2xl text-xs leading-relaxed text-sky-200/80 sm:text-sm">{t('hero.comingNext')}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href={`#${exercisesAnchorId}`}
          className={`flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 ${focusRing} focus-visible:outline-white`}
        >
          {t('hero.toExercises')}
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </a>
        <a
          href={siteInfo.repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 ${focusRing} focus-visible:outline-white`}
        >
          <CodeXml className="h-4 w-4" aria-hidden="true" />
          {t('hero.viewOnGitHub')}{' '}
          <span className="sr-only">{t('common:opensInNewTab')}</span>
        </a>
      </div>
      <div className="rounded-2xl bg-white p-4 text-slate-800">
        <ProgressBar completed={completed} total={total} />
      </div>
    </section>
  )
}

export default LandingHero
