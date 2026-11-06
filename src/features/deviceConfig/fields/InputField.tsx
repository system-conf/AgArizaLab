import { useId } from 'react'
import { focusRing } from '../../shared/focusRing'

interface InputFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** Translated error; marks the input invalid and is linked with aria-describedby. */
  error?: string
  /** Short help under the input, also linked with aria-describedby. */
  hint?: string
  /** 'address' / 'number': monospace and a numeric keyboard on phones; 'code': monospace text (host names). */
  type?: 'text' | 'address' | 'number' | 'code'
  maxLength?: number
}

/** Labelled text input of the device configuration forms. Disabled by a surrounding fieldset. */
function InputField({ label, value, onChange, error, hint, type = 'text', maxLength }: InputFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter((part) => part !== '').join(' ')
  const technical = type !== 'text'

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={type === 'address' ? 'decimal' : type === 'number' ? 'numeric' : 'text'}
        autoComplete="off"
        spellCheck={technical ? false : undefined}
        autoCapitalize={technical ? 'off' : undefined}
        dir={technical ? 'ltr' : undefined}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        className={`w-full min-w-0 rounded-md border px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500 ${
          technical ? 'font-mono' : ''
        } ${error ? 'border-rose-400' : 'border-slate-300'} ${focusRing}`}
      />
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}

export default InputField
