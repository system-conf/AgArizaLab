import { BookOpen, FolderPlus, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SampleCompletion } from '../../../samples'
import { useNumberFormat } from '../../layout/useNumberFormat'
import { focusRing } from '../../shared/focusRing'

interface LessonFooterProps {
  completion: SampleCompletion
  /** The lesson panel / sheet is open. */
  lessonOpen: boolean
  /** Id of the element the lesson button shows or hides. */
  lessonControls: string | undefined
  /** "Open as my own lab" is running. */
  saving: boolean
  onToggleLesson: () => void
  onResetLab: () => void
  onSaveAsMine: () => void
}

/** Bottom bar of a sample: lesson toggle with the step count, "Reset the lab", "Open as my own lab". */
function LessonFooter({ completion, lessonOpen, lessonControls, saving, onToggleLesson, onResetLab, onSaveAsMine }: LessonFooterProps) {
  const { t } = useTranslation('samples')
  const formatNumber = useNumberFormat()
  const summary = t('ui.card.steps', { done: formatNumber(completion.done), total: formatNumber(completion.total) })

  return (
    <footer className="flex items-center gap-2 border-t border-border bg-surface px-2 py-2 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onToggleLesson}
        aria-expanded={lessonOpen}
        aria-controls={lessonControls}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium ${
          lessonOpen ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200' : 'border-border-strong bg-surface text-fg hover:bg-surface-subtle'
        } ${focusRing}`}
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('ui.lesson.toggle')}</span>
        <span className={completion.complete ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg-subtle'}>{summary}</span>
      </button>
      <div className="min-w-0 flex-1" />
      <button
        type="button"
        onClick={onResetLab}
        title={t('ui.lesson.resetLab')}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm font-medium text-fg hover:bg-surface-subtle ${focusRing}`}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        <span className="sm:hidden">{t('ui.lesson.resetLabShort')}</span>
        <span className="hidden sm:inline">{t('ui.lesson.resetLab')}</span>
      </button>
      <button
        type="button"
        onClick={onSaveAsMine}
        disabled={saving}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 ${focusRing}`}
      >
        <FolderPlus className="h-4 w-4" aria-hidden="true" />
        <span className="sm:hidden">{t('ui.lesson.saveShort')}</span>
        <span className="hidden sm:inline">{t('ui.lesson.saveAsMine')}</span>
      </button>
    </footer>
  )
}

export default LessonFooter
