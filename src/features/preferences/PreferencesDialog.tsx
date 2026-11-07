import { X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import PreferencesView from './PreferencesView'

interface PreferencesDialogProps {
  onClose: () => void
}

const CANDIDATES = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]'

/** The elements Tab stops at, in order: no tabindex=-1 (inactive tabs), only the checked radio of a group. */
function tabStops(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(CANDIDATES)].filter(
    (element) => element.tabIndex >= 0 && !(element instanceof HTMLInputElement && element.type === 'radio' && !element.checked),
  )
}

/**
 * The Preferences as a modal dialog over the workspace (the open lab and its undo history stay): full
 * screen on phones, a centred window from 768 px. Tab stays inside, Escape closes, the opener gets the
 * focus back.
 */
function PreferencesDialog({ onClose }: PreferencesDialogProps) {
  const { t } = useTranslation('preferences')
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys stay in the dialog: the workspace shortcuts (Delete, arrows, Ctrl+A …) listen on the window.
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = tabStops(dialogRef.current)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 md:items-center md:p-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex h-full w-full flex-col bg-surface text-fg shadow-2xl md:h-[min(42rem,90vh)] md:max-w-4xl md:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-fg-strong">
            {t('title')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-muted ${focusRing}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <PreferencesView className="flex-1" />
      </div>
    </div>
  )
}

export default PreferencesDialog
