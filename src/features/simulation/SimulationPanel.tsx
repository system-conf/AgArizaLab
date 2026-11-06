import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import { useMediaQuery } from '../shared/useMediaQuery'
import EventList from './EventList'
import PduInspector from './PduInspector'
import ProtocolFilterBar from './ProtocolFilterBar'
import SimulationControls from './SimulationControls'
import type { WorkspaceSimulation } from './useSimulation'

interface SimulationPanelProps {
  simulation: WorkspaceSimulation
  nameOf: (deviceId: string) => string
}

type PanelTab = 'events' | 'inspector'

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
  const { view, selectedEvent } = simulation

  function select(eventId: number) {
    simulation.selectEvent(eventId)
    if (!split) setTab('inspector')
  }

  const events = (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProtocolFilterBar filter={simulation.filter} onChange={simulation.setFilter} />
      <EventList events={view?.events ?? []} filter={simulation.filter} selectedId={selectedEvent?.id ?? null} onSelect={select} nameOf={nameOf} />
    </div>
  )
  const inspector = (
    <section aria-label={t('ui.inspector.label')} className="relative min-h-0 flex-1 overflow-y-auto bg-slate-50">
      <PduInspector event={selectedEvent} nameOf={nameOf} onSelectEvent={select} />
    </section>
  )
  const tabs: readonly { id: PanelTab; label: string }[] = [
    { id: 'events', label: t('ui.panel.eventsTab') },
    { id: 'inspector', label: t('ui.panel.inspectorTab') },
  ]

  return (
    <section
      aria-label={t('ui.panel.label')}
      className={`flex shrink-0 flex-col border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(15,23,42,0.06)] ${
        expanded ? 'h-[48%] md:h-[42%] md:min-h-64' : ''
      }`}
    >
      <SimulationControls simulation={simulation} expanded={expanded} onToggleExpanded={() => setExpanded((open) => !open)} bodyId={bodyId} />
      {expanded && (
        <div id={bodyId} className="flex min-h-0 flex-1 flex-col border-t border-slate-100">
          {split ? (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 w-1/2 flex-col border-e border-slate-200">{events}</div>
              <div className="flex min-h-0 w-1/2 flex-col">{inspector}</div>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label={t('ui.panel.tabsLabel')} className="flex border-b border-slate-200">
                {tabs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    id={`${baseId}-${entry.id}-tab`}
                    aria-selected={tab === entry.id}
                    aria-controls={`${baseId}-${entry.id}-panel`}
                    onClick={() => setTab(entry.id)}
                    className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium ${
                      tab === entry.id ? 'border-sky-600 text-sky-800' : 'border-transparent text-slate-600'
                    } ${focusRing}`}
                  >
                    {entry.label}
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
