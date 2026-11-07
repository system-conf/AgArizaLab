import { useId, useState } from 'react'
import { focusRing } from '../../shared/focusRing'
import { parseWholeNumber } from '../model/wholeNumber'
import FieldHint from './FieldHint'

interface NumberFieldProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  /** Shown while the typed text is not a whole number in range. */
  invalidText: string
  onChange: (value: number) => void
}

/** A whole number preference: saved on every valid edit; invalid text shows the reason and is not saved. */
function NumberField({ label, hint, value, min, max, invalidText, onChange }: NumberFieldProps) {
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const [text, setText] = useState(String(value))
  const [shown, setShown] = useState(value)
  // Changed elsewhere (import, reset, another tab): show the new value.
  if (shown !== value) {
    setShown(value)
    setText(String(value))
  }
  const invalid = parseWholeNumber(text, min, max) === null
  const describedBy = [hint === undefined ? null : hintId, invalid ? errorId : null].filter((id) => id !== null).join(' ')

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text}
        aria-invalid={invalid}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onChange={(event) => {
          setText(event.target.value)
          const next = parseWholeNumber(event.target.value, min, max)
          if (next !== null && next !== value) {
            setShown(next)
            onChange(next)
          }
        }}
        onBlur={() => {
          if (invalid) setText(String(value))
        }}
        className={`h-9 w-28 rounded-lg border bg-surface px-2 text-sm text-fg ${invalid ? 'border-danger' : 'border-border-strong'} ${focusRing}`}
      />
      {invalid && (
        <p id={errorId} className="text-xs text-danger">
          {invalidText}
        </p>
      )}
      {hint !== undefined && <FieldHint id={hintId}>{hint}</FieldHint>}
    </div>
  )
}

export default NumberField
