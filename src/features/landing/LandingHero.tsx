import { ArrowRight, CodeXml, FlaskConical, ListChecks, PencilRuler } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { siteInfo } from '../layout/siteInfo'
import { routes } from '../../routing'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'

/** Top of the start page: what the lab is and the two ways in (the lab first, then the exercises). */
function LandingHero() {
  const { t } = useTranslation(['landing', 'common', 'design'])

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
      </div>
      <div className="flex flex-wrap gap-3">
        <AppLink
          to={routes.lab}
          className={`flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 ${focusRing} focus-visible:outline-white`}
        >
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {t('hero.openLab')}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        </AppLink>
        <AppLink
          to={routes.exercises}
          className={`flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 ${focusRing} focus-visible:outline-white`}
        >
          <ListChecks className="h-4 w-4" aria-hidden="true" />
          {t('hero.toExercises')}
        </AppLink>
        {/* Design (D2): design tasks */}
        <AppLink
          to={routes.designs}
          title={t('design:ui.landing.title')}
          className={`flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 ${focusRing} focus-visible:outline-white`}
        >
          <PencilRuler className="h-4 w-4" aria-hidden="true" />
          {t('design:ui.landing.cta')}
        </AppLink>
        <a
          href={siteInfo.repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-sky-100 hover:bg-white/10 ${focusRing} focus-visible:outline-white`}
        >
          <CodeXml className="h-4 w-4" aria-hidden="true" />
          {t('hero.viewOnGitHub')}{' '}
          <span className="sr-only">{t('common:opensInNewTab')}</span>
        </a>
      </div>
    </section>
  )
}

export default LandingHero
