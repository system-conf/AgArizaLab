import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import { useMediaQuery } from '../shared/useMediaQuery'
import EventList from './EventList'
import { PANEL_TABS, tabAfterKey, type PanelTab } from './panelTabs'
import PduInspector from './PduInspector'
import ProtocolFilterBar from './ProtocolFilterBar'
import SimulationControls from './SimulationControls'
import type { WorkspaceSimulation } from './useSimulation'

interface SimulationPanelProps {
  simulation: WorkspaceSimulation
  nameOf: (deviceId: string) => string
}

/**
 * The simulation panel under the canvas: playback controls, protocol filters, the event list and the
 * PDU inspector. Side by side from 768 px; on phones a bottom sheet with Events / Inspector tabs that
 * folds down to its control bar.
 */
function SimulationPanel({ simulation, nameOf }: SimulationPanelProps) {
  const { t } = useTranslation('simulation')
  const split = useMediaQuery('(min-width: 768px)')
  const [expanded, setExpanded] = useState(true)
  const [tab, setTab] = useState<PanelTab>('events')
  const baseId = useId()
  const bodyId = `${baseId}-body`
  const tabButtons = useRef(new Map<PanelTab, HTMLButtonElement>())
  const { view, selectedEvent } = simulation

  function select(eventId: number) {
    simulation.selectEvent(eventId)
    if (!split) setTab('inspector')
  }

  /** Arrow keys, Home and End move between the tabs (WAI-ARIA tabs: roving tabindex, selection follows focus). */
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const next = tabAfterKey(tab, event.key, rtl)
    if (next === null) return
    event.preventDefault()
    setTab(next)
    tabButtons.current.get(next)?.focus()
  }

  const events = (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProtocolFilterBar filter={simulation.filter} onChange={simulation.setFilter} />
      <EventList events={view.events} filter={simulation.filter} selectedId={selectedEvent?.id ?? null} onSelect={select} nameOf={nameOf} />
    </div>
  )
  const inspector = (
    <section aria-label={t('ui.inspector.label')} className="relative min-h-0 flex-1 overflow-y-auto bg-surface-subtle">
      <PduInspector event={selectedEvent} nameOf={nameOf} onSelectEvent={select} />
    </section>
  )
  const tabLabels: Readonly<Record<PanelTab, string>> = { events: t('ui.panel.eventsTab'), inspector: t('ui.panel.inspectorTab') }

  return (
    <section
      aria-label={t('ui.panel.label')}
      className={`flex shrink-0 flex-col border-t border-border bg-surface shadow-[0_-4px_12px_rgba(15,23,42,0.06)] ${
        expanded ? 'h-[48%] md:h-[42%] md:min-h-64' : ''
      }`}
    >
      <SimulationControls simulation={simulation} expanded={expanded} onToggleExpanded={() => setExpanded((open) => !open)} bodyId={bodyId} />
      {expanded && (
        <div id={bodyId} className="flex min-h-0 flex-1 flex-col border-t border-border/60">
          {split ? (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 w-1/2 flex-col border-e border-border">{events}</div>
              <div className="flex min-h-0 w-1/2 flex-col">{inspector}</div>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label={t('ui.panel.tabsLabel')} className="flex border-b border-border">
                {PANEL_TABS.map((id) => (
                  <button
                    key={id}
                    ref={(element) => {
                      if (element) tabButtons.current.set(id, element)
                      else tabButtons.current.delete(id)
                    }}
                    type="button"
                    role="tab"
                    id={`${baseId}-${id}-tab`}
                    aria-selected={tab === id}
                    aria-controls={`${baseId}-${id}-panel`}
                    tabIndex={tab === id ? 0 : -1}
                    onClick={() => setTab(id)}
                    onKeyDown={onTabKey}
                    className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium ${
                      tab === id ? 'border-sky-600 text-sky-800 dark:text-sky-200' : 'border-transparent text-fg-muted'
                    } ${focusRing}`}
                  >
                    {tabLabels[id]}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`${baseId}-${tab}-panel`} aria-labelledby={`${baseId}-${tab}-tab`} className="flex min-h-0 flex-1 flex-col">
                {tab === 'events' ? events : inspector}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default SimulationPanel
