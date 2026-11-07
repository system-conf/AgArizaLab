import { Network, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../routing'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'

/** Top bar of the landing, exercise list and result screens: app name (home link) and the language switcher. */
function SiteHeader() {
  const { t } = useTranslation(['common', 'preferences'])

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <AppLink
          to={routes.landing}
          className={`flex min-w-0 items-center gap-2 rounded-lg text-sm font-semibold text-fg-strong ${focusRing}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <Network className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate">{t('appName')}</span>
        </AppLink>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          {/* PU (Preferences screen) */}
          <AppLink
            to={routes.preferences}
            aria-label={t('preferences:open')}
            title={t('preferences:open')}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg ${focusRing}`}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </AppLink>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  )
}

export default SiteHeader
