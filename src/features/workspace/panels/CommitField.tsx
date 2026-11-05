import { useId, useState, type KeyboardEvent } from 'react'
import { focusRing } from '../../shared/focusRing'

interface CommitFieldProps {
  label: string
  value: string
  /** Called on blur / Enter (single line) when the text changed; one undo step per edit. */
  onCommit: (value: string) => void
  multiline?: boolean
  hint?: string
  placeholder?: string
  /** Visually hidden label (the context already names the field). */
  hideLabel?: boolean
  className?: string
}

const fieldClasses = `w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 ${focusRing}`

/** Draft field: typing is local, the document changes once when editing ends. Esc reverts. */
function DraftField({ label, value, onCommit, multiline, hint, placeholder, hideLabel, className }: CommitFieldProps) {
  const [draft, setDraft] = useState(value)
  const id = useId()
  const hintId = useId()

  function commit() {
    if (draft !== value) onCommit(draft)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(value)
    } else if (event.key === 'Enter' && !multiline) {
      event.currentTarget.blur()
    }
  }

  const common = {
    id,
    value: draft,
    placeholder,
    onBlur: commit,
    onKeyDown: handleKeyDown,
    'aria-describedby': hint ? hintId : undefined,
  }
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-xs font-medium text-slate-600'}>
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={6} onChange={(event) => setDraft(event.target.value)} className={`${fieldClasses} resize-y`} />
      ) : (
        <input {...common} type="text" onChange={(event) => setDraft(event.target.value)} className={fieldClasses} />
      )}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  )
}

/** Remounts the draft whenever the stored value changes (undo, rename elsewhere). */
function CommitField(props: CommitFieldProps) {
  return <DraftField key={props.value} {...props} />
}

export default CommitField
