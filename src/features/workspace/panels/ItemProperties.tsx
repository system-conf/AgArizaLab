import { Trash2, Unplug } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Annotation, LabDocument, LinkV2, TextAnnotation } from '../../../domain/v2'
import { focusRing } from '../../shared/focusRing'
import { ANNOTATION_COLORS } from '../canvas/annotationActions'
import CommitField from './CommitField'

const TEXT_SIZES: readonly TextAnnotation['size'][] = ['small', 'medium', 'large']

const dangerButton = `flex items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 ${focusRing}`
const selectClasses = `w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm ${focusRing}`

interface LinkPropertiesProps {
  doc: LabDocument
  link: LinkV2
  onDisconnect: () => void
}

/** Cable type, ends and its extra settings (SSID, DCE end); "Remove cable". */
export function LinkProperties({ doc, link, onDisconnect }: LinkPropertiesProps) {
  const { t } = useTranslation('workspace')
  const nameOf = (deviceId: string) => doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  const endText = (side: 'a' | 'b') => `${nameOf(link[side].deviceId)} ${link[side].portId}`
  const endA = endText('a')
  const endB = endText('b')
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">{t('properties.linkCable')}</dt>
        <dd className="text-slate-800">{t(`cableTools.${link.cable}`)}</dd>
        <dt className="text-slate-500">{t('properties.linkEnds')}</dt>
        <dd className="text-slate-800">
          <span className="block">{endA}</span>
          <span className="block">{endB}</span>
        </dd>
        {link.cable === 'wireless' && (
          <>
            <dt className="text-slate-500">{t('properties.linkSsid')}</dt>
            <dd className="text-slate-800">{link.ssid}</dd>
          </>
        )}
        {link.cable === 'serial' && (
          <>
            <dt className="text-slate-500">{t('properties.linkDce')}</dt>
            <dd className="text-slate-800">{endText(link.dceEnd)}</dd>
          </>
        )}
      </dl>
      {!link.connected && <p className="text-sm text-amber-700">{t('properties.unplugged')}</p>}
      <button type="button" onClick={onDisconnect} className={dangerButton}>
        <Unplug className="h-4 w-4" aria-hidden="true" />
        {t('properties.disconnect')}
      </button>
    </div>
  )
}

interface AnnotationPropertiesProps {
  annotation: Annotation
  onChange: (annotation: Annotation) => void
  onTextChange: (text: string) => void
  onDelete: () => void
}

/** Note text, colour and size (shapes: colour only); "Delete". */
export function AnnotationProperties({ annotation, onChange, onTextChange, onDelete }: AnnotationPropertiesProps) {
  const { t } = useTranslation('workspace')
  const colorId = useId()
  const sizeId = useId()
  return (
    <div className="space-y-4">
      {annotation.type === 'text' && (
        <CommitField label={t('properties.noteText')} value={annotation.text} onCommit={onTextChange} multiline />
      )}
      <div>
        <label htmlFor={colorId} className="mb-1 block text-xs font-medium text-slate-600">
          {t('properties.noteColor')}
        </label>
        <select
          id={colorId}
          value={annotation.color}
          onChange={(event) => {
            const color = ANNOTATION_COLORS.find((candidate) => candidate === event.target.value)
            if (color) onChange({ ...annotation, color })
          }}
          className={selectClasses}
        >
          {ANNOTATION_COLORS.map((color) => (
            <option key={color} value={color}>
              {t(`annotation.colors.${color}`)}
            </option>
          ))}
        </select>
      </div>
      {annotation.type === 'text' && (
        <div>
          <label htmlFor={sizeId} className="mb-1 block text-xs font-medium text-slate-600">
            {t('properties.noteSize')}
          </label>
          <select
            id={sizeId}
            value={annotation.size}
            onChange={(event) => {
              const size = TEXT_SIZES.find((candidate) => candidate === event.target.value)
              if (size) onChange({ ...annotation, size })
            }}
            className={selectClasses}
          >
            {TEXT_SIZES.map((size) => (
              <option key={size} value={size}>
                {t(`annotation.sizes.${size}`)}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="button" onClick={onDelete} className={dangerButton}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {t('properties.delete')}
      </button>
    </div>
  )
}
