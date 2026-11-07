import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePreference, type Theme } from '../../preferences'
import { focusRing } from '../shared/focusRing'
import { ThemeCycle } from './ThemeCycle'

function ThemeIcon({ theme }: { theme: Theme }) {
  const className = 'h-5 w-5'
  if (theme === 'dark') return <Moon className={className} aria-hidden="true" />
  if (theme === 'system') return <Monitor className={className} aria-hidden="true" />
  return <Sun className={className} aria-hidden="true" />
}

/**
 * Quick theme switch in the headers: one button that shows the current theme and moves to the next
 * one (Light → Dark → System). Reads and writes the same `appearance.theme` preference as the
 * Preferences screen, so both stay in step (and every open tab).
 */
function ThemeToggle() {
  const { t } = useTranslation('common')
  const [theme, setTheme] = usePreference('appearance.theme')
  const next = ThemeCycle.next(theme)
  const label = t('themeToggle.label', { current: t(`themeToggle.${theme}`), next: t(`themeToggle.${next}`) })

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg ${focusRing}`}
    >
      <ThemeIcon theme={theme} />
    </button>
  )
}

export default ThemeToggle
