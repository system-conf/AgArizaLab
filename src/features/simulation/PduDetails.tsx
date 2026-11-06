import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../i18n'
import { PROTOCOL_STYLES } from './protocolStyles'
import { SimMessages, type PduLayerView } from './simulationServices'

interface PduDetailsProps {
  title: string
  views: readonly PduLayerView[]
}

/** Header fields of one PDU, bottom-up (like a packet analyser's detail pane). Values stay protocol notation. */
function PduDetails({ title, views }: PduDetailsProps) {
  const { t } = useTranslation('simulation')
  const translate = useMessageTranslator()

  return (
    <section className="min-w-0 flex-1">
      <h4 className="mb-1.5 text-sm font-semibold text-slate-900">{title}</h4>
      {views.length === 0 ? (
        <p className="text-xs text-slate-500">{t('ui.inspector.noDetails')}</p>
      ) : (
        <div className="space-y-2">
          {views.map((view, index) => (
            <table key={`${view.protocol}-${index}`} className="w-full border-collapse overflow-hidden rounded-md text-xs ring-1 ring-slate-200">
              <caption className="bg-slate-50 px-2 py-1 text-start">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${PROTOCOL_STYLES[view.protocol].chip}`}>
                  {translate(SimMessages.protocol(view.protocol))}
                </span>
                <span className="ms-2 text-slate-500">{translate(SimMessages.layer(view.layer))}</span>
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t('ui.inspector.field')}</th>
                  <th scope="col">{t('ui.inspector.value')}</th>
                </tr>
              </thead>
              <tbody>
                {view.fields.map((field, fieldIndex) => (
                  <tr key={`${field.field}-${fieldIndex}`} className="border-t border-slate-100">
                    <th scope="row" className="w-2/5 px-2 py-1 text-start font-medium text-slate-600">
                      {translate(SimMessages.field(field.field))}
                    </th>
                    <td className="break-all px-2 py-1 font-mono text-slate-900" dir="ltr">
                      {field.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
    </section>
  )
}

export default PduDetails
