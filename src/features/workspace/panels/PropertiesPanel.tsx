import { MousePointerClick, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Annotation, Device, LabDocument } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import type { WorkspaceSelection } from '../canvas/canvasTypes'
import { SelectionModel } from '../canvas/SelectionModel'
import { LAB_LIMITS, type ExerciseLockPolicy } from '../labServices'
import CommitField from './CommitField'
import { AnnotationProperties, LinkProperties } from './ItemProperties'

interface PropertiesPanelProps {
  doc: LabDocument
  selection: WorkspaceSelection
  policy: ExerciseLockPolicy
  /** Name, model and the Info / Settings / Terminal tabs of the one selected device. */
  renderDevice: (device: Device) => ReactNode
  onDisconnect: (linkId: string) => void
  onSetLinkConnected: (linkId: string, connected: boolean) => void
  onAnnotationChange: (annotation: Annotation) => void
  onNoteText: (annotationId: string, text: string) => void
  onDeleteSelection: () => void
  /** The lab's notes field when nothing is selected; absent in exercise mode (notes sit in the footer). */
  onNotes?: (notes: string) => void
  /** Shown as a close button (phone bottom sheet); absent on the desktop side panel. */
  onClose?: () => void
}

/**
 * Right-hand panel: the selected device (with tabs), cable or note; several selected → count and
 * delete; nothing selected → the lab's notes (free lab) or a hint (exercise).
 */
function PropertiesPanel(props: PropertiesPanelProps) {
  const { t } = useTranslation('workspace')
  const { doc, selection, policy } = props
  const count = SelectionModel.count(selection)

  function body() {
    if (count === 0) {
      if (props.onNotes) {
        return (
          <CommitField label={t('properties.notes')} value={doc.notes} onCommit={props.onNotes} multiline hint={t('properties.notesHint')} maxLength={LAB_LIMITS.notesLength} />
        )
      }
      return (
        <p className="m-auto flex max-w-60 flex-col items-center gap-3 py-8 text-center text-sm text-slate-500">
          <MousePointerClick className="h-7 w-7 text-sky-700" aria-hidden="true" />
          {t('properties.selectHint')}
        </p>
      )
    }
    if (count > 1) {
      const deletable = SelectionModel.count(policy.allowedDeletion(selection)) > 0
      return (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{t('properties.selected', { count })}</p>
          {deletable && (
            <button
              type="button"
              onClick={props.onDeleteSelection}
              className={`flex items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 ${focusRing}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('properties.delete')}
            </button>
          )}
        </div>
      )
    }
    const device = doc.state.devices.find((candidate) => candidate.id === selection.deviceIds[0])
    if (device) return props.renderDevice(device)
    const link = doc.state.links.find((candidate) => candidate.id === selection.linkIds[0])
    if (link) {
      return (
        <LinkProperties
          doc={doc}
          link={link}
          onDisconnect={policy.canDeleteLink(link.id) ? () => props.onDisconnect(link.id) : undefined}
          onSetConnected={policy.canUnplugLink(link.id) ? (connected) => props.onSetLinkConnected(link.id, connected) : undefined}
        />
      )
    }
    const annotation = doc.annotations.find((candidate) => candidate.id === selection.annotationIds[0])
    if (annotation) {
      return (
        <AnnotationProperties
          key={annotation.id}
          annotation={annotation}
          onChange={props.onAnnotationChange}
          onTextChange={(text) => props.onNoteText(annotation.id, text)}
          onDelete={props.onDeleteSelection}
        />
      )
    }
    return null
  }

  return (
    <section aria-labelledby="properties-heading" className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <h2 id="properties-heading" className="text-sm font-semibold text-slate-900">
          {t('properties.title')}
        </h2>
        {props.onClose && (
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t('properties.close')}
            className={`rounded p-1 text-slate-500 hover:bg-slate-100 ${focusRing}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4">{body()}</div>
    </section>
  )
}

export default PropertiesPanel
