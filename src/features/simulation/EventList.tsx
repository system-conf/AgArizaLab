import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage, useMessageTranslator } from '../../i18n'
import { focusRing } from '../shared/focusRing'
import { EventFilters } from './model/EventFilters'
import { actionTone, NO_PROTOCOL_CHIP, PROTOCOL_STYLES } from './protocolStyles'
import { SimMessages, type EventFilter, type SimEvent } from './simulationServices'

/** Rows rendered at most; older events stay in the simulation and in the .pcap. */
const MAX_ROWS = 400

interface EventListProps {
  events: readonly SimEvent[]
  filter: EventFilter
  selectedId: number | null
  onSelect: (eventId: number) => void
  nameOf: (deviceId: string) => string
}

/** The event list (Packet Tracer "Event List"): time, devices, protocol, action, what the PDU is. */
function EventList({ events, filter, selectedId, onSelect, nameOf }: EventListProps) {
  const { t } = useTranslation('simulation')
  const translate = useMessageTranslator()
  const { language } = useLanguage()
  const scroller = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => EventFilters.apply(filter, events), [events, filter])
  const shown = useMemo(() => filtered.slice(-MAX_ROWS).map(EventFilters.row), [filtered])
  const seconds = useMemo(() => new Intl.NumberFormat(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }), [language])
  const lastId = shown[shown.length - 1]?.eventId

  // New events appear at the bottom: follow them, as a packet analyser does.
  useEffect(() => {
    const element = scroller.current
    if (element && lastId !== undefined) element.scrollTop = element.scrollHeight
  }, [lastId])

  if (events.length === 0) return <p className="p-3 text-sm text-slate-500">{t('ui.events.empty')}</p>
  if (filtered.length === 0) return <p className="p-3 text-sm text-slate-500">{t('ui.events.filteredEmpty')}</p>

  return (
    <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
      {filtered.length > shown.length && (
        <p className="px-3 py-1 text-xs text-slate-500">{t('ui.events.truncated', { shown: shown.length, total: filtered.length })}</p>
      )}
      <ol aria-label={t('ui.events.label')} className="divide-y divide-slate-100">
        {shown.map((row) => {
          const selected = row.eventId === selectedId
          const at = nameOf(row.deviceId)
          const route = row.lastDeviceId === undefined ? at : t('ui.events.route', { from: nameOf(row.lastDeviceId), to: at })
          return (
            <li key={row.eventId}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${t('ui.events.eventNumber', { id: row.eventId })}, ${translate(row.summary)}, ${route}, ${translate(row.info)}`}
                onClick={() => onSelect(row.eventId)}
                className={`block w-full px-3 py-1.5 text-start text-xs transition hover:bg-slate-50 ${
                  selected ? 'bg-sky-50 ring-2 ring-inset ring-sky-400 hover:bg-sky-50' : ''
                } ${focusRing}`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-slate-500">{t('ui.time.seconds', { value: seconds.format(row.time / 1000) })}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${row.protocol ? PROTOCOL_STYLES[row.protocol].chip : NO_PROTOCOL_CHIP}`}>
                    {row.protocol ? translate(SimMessages.protocol(row.protocol)) : t('ui.events.client')}
                  </span>
                  <span className={`font-semibold ${actionTone(row.action)}`}>{translate(row.summary)}</span>
                  <span className="ms-auto truncate text-slate-600">{route}</span>
                </span>
                <span className="mt-0.5 block truncate text-slate-700" dir="auto">
                  {translate(row.info)}
                </span>
                {row.reason && <span className="mt-0.5 block text-red-700">{translate(row.reason)}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default EventList
