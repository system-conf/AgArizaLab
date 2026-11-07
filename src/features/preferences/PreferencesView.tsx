import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import { useMediaQuery } from '../shared/useMediaQuery'
import { PREFERENCE_TABS, preferenceTabAfterKey, type PreferenceTab } from './model/preferenceTabs'
import AppearanceSection from './sections/AppearanceSection'
import CablesSection from './sections/CablesSection'
import DataSection from './sections/DataSection'
import LanguageSection from './sections/LanguageSection'
import MapSection from './sections/MapSection'
import SimulationSection from './sections/SimulationSection'
import TerminalSection from './sections/TerminalSection'

function sectionOf(tab: PreferenceTab): ReactNode {
  switch (tab) {
    case 'appearance':
      return <AppearanceSection />
    case 'map':
      return <MapSection />
    case 'simulation':
      return <SimulationSection />
    case 'terminal':
      return <TerminalSection />
    case 'cables':
      return <CablesSection />
    case 'language':
      return <LanguageSection />
    case 'data':
      return <DataSection />
  }
}

interface PreferencesViewProps {
  /** Classes of the outer box (the page and the dialog size it differently). */
  className?: string
}

/**
 * The preference tabs and the open tab's fields (WAI-ARIA tabs: roving tabindex, selection follows
 * focus). From 768 px a vertical tab column beside the fields, like a desktop simulator's preferences;
 * on phones a scrollable tab row above them. Every change is saved at once.
 */
function PreferencesView({ className = '' }: PreferencesViewProps) {
  const { t } = useTranslation('preferences')
  const wide = useMediaQuery('(min-width: 768px)')
  const orientation = wide ? 'vertical' : 'horizontal'
  const [tab, setTab] = useState<PreferenceTab>('appearance')
  const baseId = useId()
  const tabButtons = useRef(new Map<PreferenceTab, HTMLButtonElement>())
  const tabId = (value: PreferenceTab) => `${baseId}-${value}-tab`
  const panelId = `${baseId}-panel`

  // The phone's tab row scrolls: keep the open tab in view.
  useEffect(() => {
    tabButtons.current.get(tab)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const next = preferenceTabAfterKey(tab, event.key, orientation, rtl)
    if (next === null) return
    event.preventDefault()
    setTab(next)
    tabButtons.current.get(next)?.focus()
  }

  return (
    <div className={`flex min-h-0 flex-col md:flex-row ${className}`}>
      <div
        role="tablist"
        aria-label={t('tabsLabel')}
        aria-orientation={orientation}
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 [scrollbar-width:thin] md:w-56 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-e md:border-b-0"
      >
        {PREFERENCE_TABS.map((value) => {
          const selected = value === tab
          return (
            <button
              key={value}
              ref={(element) => {
                if (element) tabButtons.current.set(value, element)
                else tabButtons.current.delete(value)
              }}
              type="button"
              role="tab"
              id={tabId(value)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(value)}
              onKeyDown={onTabKey}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm ${
                selected ? 'bg-accent-muted font-semibold text-accent-text' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
              } ${focusRing}`}
            >
              {t(`tabs.${value}`)}
            </button>
          )
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"
      >
        <h2 className="mb-4 text-lg font-semibold text-fg-strong">{t(`tabs.${tab}`)}</h2>
        {sectionOf(tab)}
      </div>
    </div>
  )
}

export default PreferencesView
