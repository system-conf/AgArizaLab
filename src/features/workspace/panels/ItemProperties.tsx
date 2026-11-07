import { Plug, Trash2, Unplug } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Annotation, LabDocument, Link, TextAnnotation } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import { ANNOTATION_COLORS } from '../canvas/annotationActions'
import { LAB_LIMITS } from '../labServices'
import CommitField from './CommitField'

const TEXT_SIZES: readonly TextAnnotation['size'][] = ['small', 'medium', 'large']

const dangerButton = `flex items-center gap-1.5 rounded-md border border-rose-200 dark:border-rose-800 px-3 py-1.5 text-sm text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 ${focusRing}`
const selectClasses = `w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm ${focusRing}`

interface LinkPropertiesProps {
  doc: LabDocument
  link: Link
  /** Absent: the exercise does not allow removing this cable. */
  onDisconnect?: () => void
  /** Plug / unplug without removing the cable; absent when the cable is locked. */
  onSetConnected?: (connected: boolean) => void
}

const secondaryButton = `flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-subtle ${focusRing}`

/** Cable type, ends and its extra settings (SSID, DCE end); plug / unplug and "Remove cable". */
export function LinkProperties({ doc, link, onDisconnect, onSetConnected }: LinkPropertiesProps) {
  const { t } = useTranslation('workspace')
  const nameOf = (deviceId: string) => doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  const endText = (side: 'a' | 'b') => `${nameOf(link[side].deviceId)} ${link[side].portId}`
  const endA = endText('a')
  const endB = endText('b')
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-subtle">{t('properties.linkCable')}</dt>
        <dd className="text-fg">{t(`cableTools.${link.cable}`)}</dd>
        <dt className="text-fg-subtle">{t('properties.linkEnds')}</dt>
        <dd className="text-fg">
          <span className="block">{endA}</span>
          <span className="block">{endB}</span>
        </dd>
        {link.cable === 'wireless' && (
          <>
            <dt className="text-fg-subtle">{t('properties.linkSsid')}</dt>
            <dd className="text-fg">{link.ssid}</dd>
          </>
        )}
        {link.cable === 'serial' && (
          <>
            <dt className="text-fg-subtle">{t('properties.linkDce')}</dt>
            <dd className="text-fg">{endText(link.dceEnd)}</dd>
          </>
        )}
      </dl>
      {!link.connected && <p className="text-sm text-amber-700 dark:text-amber-300">{t('properties.unplugged')}</p>}
      <div className="flex flex-wrap gap-2">
        {onSetConnected && link.cable !== 'wireless' && (
          <button type="button" onClick={() => onSetConnected(!link.connected)} className={secondaryButton}>
            {link.connected ? <Unplug className="h-4 w-4" aria-hidden="true" /> : <Plug className="h-4 w-4" aria-hidden="true" />}
            {t(link.connected ? 'properties.unplug' : 'properties.plug')}
          </button>
        )}
        {onDisconnect && (
          <button type="button" onClick={onDisconnect} className={dangerButton}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('properties.disconnect')}
          </button>
        )}
      </div>
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
        <CommitField label={t('properties.noteText')} value={annotation.text} onCommit={onTextChange} multiline maxLength={LAB_LIMITS.textLength} />
      )}
      <div>
        <label htmlFor={colorId} className="mb-1 block text-xs font-medium text-fg-muted">
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
          <label htmlFor={sizeId} className="mb-1 block text-xs font-medium text-fg-muted">
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
