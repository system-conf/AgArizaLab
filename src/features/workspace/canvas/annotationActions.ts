import { createContext, useContext } from 'react'
import type { AnnotationColor } from '../../../domain/v2'

/** Lets annotation nodes (rendered by React Flow) edit their text in the lab document. */
export interface AnnotationActions {
  /** Annotation whose text is being edited, if any. */
  editingId: string | null
  startEditing: (annotationId: string) => void
  /** Saves the text (blank text removes the note) and ends editing. */
  commitText: (annotationId: string, text: string) => void
  cancelEditing: () => void
}

export const AnnotationActionsContext = createContext<AnnotationActions | null>(null)

export function useAnnotationActions(): AnnotationActions {
  const actions = useContext(AnnotationActionsContext)
  if (actions === null) throw new Error('useAnnotationActions must be used inside AnnotationActionsContext')
  return actions
}

/** Tailwind classes per colour token: text notes and shape outlines. */
export const ANNOTATION_COLOR_CLASSES: Readonly<Record<AnnotationColor, { note: string; shape: string }>> = {
  neutral: { note: 'bg-white border-slate-300 text-slate-800', shape: 'border-slate-400 bg-slate-200/40 text-slate-700' },
  blue: { note: 'bg-sky-50 border-sky-300 text-sky-900', shape: 'border-sky-400 bg-sky-100/40 text-sky-800' },
  green: { note: 'bg-emerald-50 border-emerald-300 text-emerald-900', shape: 'border-emerald-400 bg-emerald-100/40 text-emerald-800' },
  amber: { note: 'bg-amber-50 border-amber-300 text-amber-900', shape: 'border-amber-400 bg-amber-100/40 text-amber-800' },
  red: { note: 'bg-rose-50 border-rose-300 text-rose-900', shape: 'border-rose-400 bg-rose-100/40 text-rose-800' },
  purple: { note: 'bg-violet-50 border-violet-300 text-violet-900', shape: 'border-violet-400 bg-violet-100/40 text-violet-800' },
}

export const ANNOTATION_COLORS: readonly AnnotationColor[] = ['neutral', 'blue', 'green', 'amber', 'red', 'purple']
