import { createContext, useContext } from 'react'
import type { AnnotationColor } from '../../../domain'

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
  neutral: { note: 'bg-surface border-border-strong text-fg', shape: 'border-slate-400 bg-surface-strong/40 text-fg' },
  blue: { note: 'bg-accent-muted border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200', shape: 'border-sky-400 bg-sky-100/40 dark:bg-sky-900/20 text-sky-800 dark:text-sky-200' },
  green: { note: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200', shape: 'border-emerald-400 bg-emerald-100/40 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200' },
  amber: { note: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200', shape: 'border-amber-400 bg-amber-100/40 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' },
  red: { note: 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200', shape: 'border-rose-400 bg-rose-100/40 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200' },
  purple: { note: 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700 text-violet-900 dark:text-violet-200', shape: 'border-violet-400 bg-violet-100/40 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200' },
}

export const ANNOTATION_COLORS: readonly AnnotationColor[] = ['neutral', 'blue', 'green', 'amber', 'red', 'purple']
