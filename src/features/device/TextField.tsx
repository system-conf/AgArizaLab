import { useId } from 'react'
import { focusRing } from '../shared/focusRing'

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** Translated error text; shown under the input and marks it invalid. */
  error?: string
  disabled?: boolean
  placeholder?: string
}

/** Labelled text input with an inline error message. */
function TextField({ label, value, onChange, error, disabled, placeholder }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded-md border px-2 py-1.5 font-mono text-sm disabled:bg-slate-100 disabled:text-slate-500 ${
          error ? 'border-rose-400' : 'border-slate-300'
        } ${focusRing}`}
      />
      {error && (
        <p id={errorId} className="text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}

export default TextField
