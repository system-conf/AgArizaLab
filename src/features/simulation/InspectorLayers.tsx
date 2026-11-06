import { ArrowDown, ArrowUp } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../i18n'
import type { InspectorRow } from './model/InspectorModels'
import { PROTOCOL_STYLES } from './protocolStyles'
import { SimMessages } from './simulationServices'

interface InspectorLayersProps {
  direction: 'in' | 'out'
  rows: readonly InspectorRow[]
}

/**
 * One column of the OSI view: the layers the PDU passed in this device, in the order the device
 * handled them, each with the decisions taken there.
 */
function InspectorLayers({ direction, rows }: InspectorLayersProps) {
  const { t } = useTranslation('simulation')
  const translate = useMessageTranslator()
  const Arrow = direction === 'in' ? ArrowUp : ArrowDown
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="min-w-0 flex-1">
      <h4 id={headingId} className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Arrow className="h-4 w-4 text-slate-500" aria-hidden="true" />
        {direction === 'in' ? t('ui.inspector.inLayers') : t('ui.inspector.outLayers')}
      </h4>
      <p className="mb-2 text-xs text-slate-500">{direction === 'in' ? t('ui.inspector.inHint') : t('ui.inspector.outHint')}</p>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-2 text-xs text-slate-500">
          {direction === 'in' ? t('ui.inspector.noIn') : t('ui.inspector.noOut')}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.layer} className="rounded-md border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-800">{translate(SimMessages.layer(row.layer))}</span>
                {row.protocols.length > 0 ? (
                  row.protocols.map((protocol) => (
                    <span key={protocol} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${PROTOCOL_STYLES[protocol].chip}`}>
                      {translate(SimMessages.protocol(protocol))}
                    </span>
                  ))
                ) : (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{translate(row.title)}</span>
                )}
              </div>
              {row.notes.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 ps-4 text-xs text-slate-700">
                  {row.notes.map((note, index) => (
                    <li key={index}>{translate(note)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-400">{t('ui.inspector.noNotes')}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default InspectorLayers
