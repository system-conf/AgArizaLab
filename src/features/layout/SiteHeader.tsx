import { Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../routing'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'
import LanguageSwitcher from './LanguageSwitcher'

/** Top bar of the landing, exercise list and result screens: app name (home link) and the language switcher. */
function SiteHeader() {
  const { t } = useTranslation('common')

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <AppLink
          to={routes.landing}
          className={`flex min-w-0 items-center gap-2 rounded-lg text-sm font-semibold text-slate-900 ${focusRing}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-700 text-white">
            <Network className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate">{t('appName')}</span>
        </AppLink>
        <LanguageSwitcher />
      </div>
    </header>
  )
}

export default SiteHeader
