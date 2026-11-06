import type { NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShapeAnnotation, TextAnnotation } from '../../../domain'
import { LAB_LIMITS } from '../labServices'
import { ANNOTATION_COLOR_CLASSES, useAnnotationActions } from './annotationActions'
import type { AnnotationNode } from './canvasTypes'

const TEXT_SIZE_CLASSES: Readonly<Record<TextAnnotation['size'], string>> = {
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-lg font-semibold',
}

/** In-place editor; mounted fresh each time editing starts, so the draft starts from the saved text. */
function NoteEditor({ annotation }: { annotation: TextAnnotation }) {
  const { t } = useTranslation('workspace')
  const actions = useAnnotationActions()
  const [draft, setDraft] = useState(annotation.text)
  // Esc and Ctrl+Enter end editing; a blur fired while the editor unmounts must not save again.
  const finished = useRef(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const colors = ANNOTATION_COLOR_CLASSES[annotation.color].note

  // Focus the note that was just created or opened. React Flow shows a new node only after
  // measuring it, so autoFocus would hit a hidden element: wait a frame (or two) first.
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        field.current?.focus()
        field.current?.select()
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Keys typed into the note must not reach the canvas shortcuts or React Flow.
    event.stopPropagation()
    if (event.key === 'Escape') {
      finished.current = true
      actions.cancelEditing()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      finished.current = true
      actions.commitText(annotation.id, draft)
    }
  }

  return (
    <textarea
      ref={field}
      aria-label={t('annotation.editLabel')}
      value={draft}
      maxLength={LAB_LIMITS.textLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!finished.current) actions.commitText(annotation.id, draft)
      }}
      onKeyDown={handleKey}
      className={`nodrag nowheel nopan block min-h-16 w-48 resize rounded-lg border-2 border-sky-500 p-2 shadow-md outline-none ${colors} ${TEXT_SIZE_CLASSES[annotation.size]}`}
    />
  )
}

/** Sticky-note style text. Double-click (or Enter while the node is focused) edits it in place. */
function TextNote({ annotation, selected }: { annotation: TextAnnotation; selected: boolean }) {
  const { t } = useTranslation('workspace')
  const actions = useAnnotationActions()
  if (actions.editingId === annotation.id) return <NoteEditor annotation={annotation} />
  const colors = ANNOTATION_COLOR_CLASSES[annotation.color].note
  const ring = selected ? 'ring-4 ring-sky-200 border-sky-500' : ''
  return (
    <div
      onDoubleClick={() => actions.startEditing(annotation.id)}
      title={t('annotation.editHint')}
      className={`max-w-64 min-w-16 whitespace-pre-wrap rounded-lg border p-2 shadow-sm ${colors} ${TEXT_SIZE_CLASSES[annotation.size]} ${ring}`}
    >
      {annotation.text}
    </div>
  )
}

function ShapeBox({ annotation, selected }: { annotation: ShapeAnnotation; selected: boolean }) {
  const colors = ANNOTATION_COLOR_CLASSES[annotation.color].shape
  const shape = annotation.type === 'ellipse' ? 'rounded-[50%]' : 'rounded-lg'
  const fill = annotation.filled ? '' : 'bg-transparent'
  return (
    <div className={`h-full w-full border-2 border-dashed ${shape} ${colors} ${fill} ${selected ? 'ring-4 ring-sky-200' : ''}`}>
      {annotation.label && <span className="block p-2 text-sm font-medium">{annotation.label}</span>}
    </div>
  )
}

/** A canvas annotation: a text note, or a rectangle / ellipse drawn behind the devices. */
function AnnotationNodeView({ data, selected }: NodeProps<AnnotationNode>) {
  const { annotation } = data
  if (annotation.type === 'text') return <TextNote annotation={annotation} selected={selected} />
  if (annotation.type === 'line') return null
  return <ShapeBox annotation={annotation} selected={selected} />
}

export default memo(AnnotationNodeView)
