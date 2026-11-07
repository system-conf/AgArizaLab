import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../i18n'
import { focusRing } from '../shared/focusRing'
import { EventFilters, FILTER_PROTOCOLS } from './model/EventFilters'
import { PROTOCOL_STYLES } from './protocolStyles'
import { SimMessages, type EventFilter } from './simulationServices'

interface ProtocolFilterBarProps {
  filter: EventFilter
  onChange: (filter: EventFilter) => void
}

/** Protocol chips that choose what the event list shows (never what the simulation does). */
function ProtocolFilterBar({ filter, onChange }: ProtocolFilterBarProps) {
  const { t } = useTranslation('simulation')
  const translate = useMessageTranslator()
  const allOn = FILTER_PROTOCOLS.every((protocol) => EventFilters.has(filter, protocol))

  return (
    <div role="group" aria-label={t('ui.filters.label')} className="flex gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]">
      <button
        type="button"
        onClick={() => onChange(allOn ? EventFilters.none() : EventFilters.all())}
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-sky-800 dark:text-sky-200 ring-1 ring-sky-200 dark:ring-sky-800 hover:bg-accent-muted ${focusRing}`}
      >
        {allOn ? t('ui.filters.none') : t('ui.filters.all')}
      </button>
      {FILTER_PROTOCOLS.map((protocol) => {
        const on = EventFilters.has(filter, protocol)
        return (
          <button
            key={protocol}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(EventFilters.toggle(filter, protocol))}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
              on ? PROTOCOL_STYLES[protocol].chip : 'bg-surface text-fg-subtle ring-border line-through'
            } ${focusRing}`}
          >
            {translate(SimMessages.protocol(protocol))}
          </button>
        )
      })}
    </div>
  )
}

export default ProtocolFilterBar
