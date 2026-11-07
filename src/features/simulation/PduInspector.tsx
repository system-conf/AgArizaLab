import { CornerDownRight, Info, TriangleAlert } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage, useMessageTranslator } from '../../i18n'
import { focusRing } from '../shared/focusRing'
import InspectorLayers from './InspectorLayers'
import { InspectorModels } from './model/InspectorModels'
import PduDetails from './PduDetails'
import { decisionTone, NO_PROTOCOL_CHIP, PROTOCOL_STYLES } from './protocolStyles'
import { SimMessages, type SimEvent } from './simulationServices'

type InspectorTab = 'osi' | 'details'

const DIRECTIONS = ['in', 'out'] as const

interface PduInspectorProps {
  event: SimEvent | null
  nameOf: (deviceId: string) => string
  onSelectEvent: (eventId: number) => void
}

/**
 * The learning heart of the simulation (Packet Tracer "PDU Information at Device"): what the device
 * did with the PDU and why, layer by layer on the way in and out, plus every header field.
 */
function PduInspector({ event, nameOf, onSelectEvent }: PduInspectorProps) {
  const { t } = useTranslation('simulation')
  const translate = useMessageTranslator()
  const { language } = useLanguage()
  const [tab, setTab] = useState<InspectorTab>('osi')
  const baseId = useId()
  const view = useMemo(() => (event ? InspectorModels.build(event, nameOf) : null), [event, nameOf])

  if (!view) return <p className="p-3 text-sm text-fg-subtle">{t('ui.inspector.empty')}</p>

  const seconds = new Intl.NumberFormat(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(view.time / 1000)
  const failed = view.action === 'dropped' || view.action === 'timedOut'
  const tabs: readonly { id: InspectorTab; label: string }[] = [
    { id: 'osi', label: t('ui.inspector.osiTab') },
    { id: 'details', label: t('ui.inspector.detailsTab') },
  ]

  return (
    <div className="space-y-3 p-3">
      <header className="space-y-1">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg-strong">
          <span>{t('ui.inspector.at', { device: nameOf(view.deviceId) })}</span>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${view.protocol ? PROTOCOL_STYLES[view.protocol].chip : NO_PROTOCOL_CHIP}`}>
            {view.protocol ? translate(SimMessages.protocol(view.protocol)) : t('ui.events.client')}
          </span>
        </h3>
        <p className="text-xs text-fg-subtle">
          <span className="font-mono tabular-nums">{t('ui.time.seconds', { value: seconds })}</span>
          {view.lastDeviceId !== undefined && <span className="ms-2">{t('ui.inspector.from', { device: nameOf(view.lastDeviceId) })}</span>}
          <span className="ms-2">{t('ui.events.eventNumber', { id: view.eventId })}</span>
        </p>
      </header>

      <section aria-label={t('ui.inspector.decision')} className={`rounded-lg border p-2.5 text-sm ${decisionTone(view.action)}`}>
        <p className="flex items-start gap-2 font-medium">
          {failed ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>
            <span className="me-1.5 rounded bg-surface/70 px-1.5 py-0.5 text-xs font-semibold">{translate(SimMessages.action(view.action))}</span>
            {translate(view.decision)}
          </span>
        </p>
        {view.reason && (
          <p className="mt-1 ps-6">
            <span className="me-1.5 rounded bg-surface/70 px-1.5 py-0.5 text-xs font-semibold">{t('ui.inspector.why')}</span>
            {translate(view.reason)}
          </p>
        )}
        {view.causeEventId !== undefined && (
          <button
            type="button"
            onClick={() => view.causeEventId !== undefined && onSelectEvent(view.causeEventId)}
            className={`mt-1 ms-6 flex items-center gap-1 text-xs underline underline-offset-2 ${focusRing}`}
          >
            <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            {t('ui.inspector.causedBy', { id: view.causeEventId })}
          </button>
        )}
      </section>

      <div role="tablist" aria-label={t('ui.inspector.tabsLabel')} className="flex gap-1 border-b border-border">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`${baseId}-${entry.id}-tab`}
            aria-selected={tab === entry.id}
            aria-controls={`${baseId}-${entry.id}-panel`}
            onClick={() => setTab(entry.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
              tab === entry.id ? 'border-sky-600 text-sky-800 dark:text-sky-200' : 'border-transparent text-fg-muted hover:text-fg-strong'
            } ${focusRing}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${baseId}-${tab}-panel`} aria-labelledby={`${baseId}-${tab}-tab`}>
        {tab === 'osi' ? (
          <div className="flex flex-col gap-3 xl:flex-row">
            {DIRECTIONS.map((direction) => (
              <InspectorLayers key={direction} direction={direction} rows={direction === 'in' ? view.inLayers : view.outLayers} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3 xl:flex-row">
            <PduDetails title={t('ui.inspector.inbound')} views={view.inboundDetails} />
            <PduDetails title={t('ui.inspector.outbound')} views={view.outboundDetails} />
          </div>
        )}
      </div>
    </div>
  )
}

export default PduInspector
