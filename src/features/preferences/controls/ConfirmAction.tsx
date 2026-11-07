import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'

interface ConfirmActionProps {
  /** The first button. */
  label: string
  /** The question shown after the first click. */
  question: string
  /** The button that does it. */
  confirmLabel: string
  onConfirm: () => void
  /** Destructive actions are red. */
  danger?: boolean
  disabled?: boolean
}

const BUTTON = 'min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'

/**
 * A button that asks before it acts: the question and Confirm / Cancel appear in place (no browser
 * dialog), Cancel takes the focus so Enter never confirms by accident; Escape cancels.
 */
function ConfirmAction({ label, question, confirmLabel, onConfirm, danger, disabled }: ConfirmActionProps) {
  const { t } = useTranslation('preferences')
  const [asking, setAsking] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const tone = danger === true ? 'bg-danger text-surface hover:opacity-90' : 'bg-accent text-accent-fg hover:bg-accent-hover'

  useEffect(() => {
    if (asking) cancelRef.current?.focus()
  }, [asking])

  function cancel() {
    setAsking(false)
    // The opener is rendered again after this update.
    requestAnimationFrame(() => openerRef.current?.focus())
  }

  if (!asking) {
    return (
      <button
        ref={openerRef}
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className={`${BUTTON} self-start ring-1 ${danger === true ? 'text-danger ring-danger' : 'text-accent-text ring-border-strong'} hover:bg-surface-muted ${focusRing}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        cancel()
      }}
      className={`flex flex-col gap-3 rounded-lg border p-3 ${danger === true ? 'border-danger bg-danger-muted' : 'border-border-strong bg-surface-muted'}`}
    >
      <p className="text-sm text-fg">{question}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setAsking(false)
            onConfirm()
          }}
          className={`${BUTTON} ${tone} ${focusRing}`}
        >
          {confirmLabel}
        </button>
        <button ref={cancelRef} type="button" onClick={cancel} className={`${BUTTON} bg-surface text-fg ring-1 ring-border-strong hover:bg-surface-muted ${focusRing}`}>
          {t('data.cancel')}
        </button>
      </div>
    </div>
  )
}

export default ConfirmAction
