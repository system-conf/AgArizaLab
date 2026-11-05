import { useTranslation } from 'react-i18next'
import type { DeviceV2, LabDocument, LinkEndV2 } from '../../../domain/v2'
import { useMessageTranslator } from '../../../i18n'
import { findDeviceModel } from '../labServices'
import CommitField from './CommitField'

interface DevicePropertiesProps {
  doc: LabDocument
  device: DeviceV2
  onRename: (name: string) => void
}

function otherEnd(doc: LabDocument, deviceId: string, portId: string): LinkEndV2 | undefined {
  for (const link of doc.state.links) {
    if (link.a.deviceId === deviceId && link.a.portId === portId) return link.b
    if (link.b.deviceId === deviceId && link.b.portId === portId) return link.a
  }
  return undefined
}

/** Name (editable), model, type and the read-only port list of one device. */
function DeviceProperties({ doc, device, onRename }: DevicePropertiesProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const model = findDeviceModel(device.modelId)
  const nameOf = (deviceId: string) => doc.state.devices.find((candidate) => candidate.id === deviceId)?.name ?? deviceId

  return (
    <div className="space-y-4">
      <CommitField label={t('properties.name')} value={device.name} onCommit={onRename} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">{t('properties.model')}</dt>
        <dd className="text-slate-800">{model ? translate({ key: model.nameKey }) : device.modelId}</dd>
        <dt className="text-slate-500">{t('properties.type')}</dt>
        <dd className="text-slate-800">{t(`deviceKinds.${device.kind}`)}</dd>
      </dl>
      <section aria-labelledby="device-ports-heading">
        <h3 id="device-ports-heading" className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('properties.ports')}
        </h3>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
          {device.ports.map((port) => {
            const linked = otherEnd(doc, device.id, port.id)
            let status = t('properties.portFree')
            if (linked) status = t('properties.portLinked', { device: nameOf(linked.deviceId), port: linked.portId })
            if (!port.adminUp) status = `${status} · ${t('properties.portShut')}`
            return (
              <li key={port.id} className="flex items-baseline justify-between gap-2 px-2 py-1">
                <span className="font-mono text-slate-800">{port.id}</span>
                <span className="text-xs text-slate-500">{t(`media.${port.medium}`)}</span>
                <span className={`ms-auto text-end text-xs ${linked ? 'text-emerald-700' : 'text-slate-500'}`}>{status}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

export default DeviceProperties
