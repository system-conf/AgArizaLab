import { useId } from 'react'
import { focusRing } from '../../shared/focusRing'

interface CheckboxFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  error?: string
}

/** Checkbox with its label on the same line. */
function CheckboxField({ label, checked, onChange, hint, error }: CheckboxFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter((part) => part !== '').join(' ')

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          className={`mt-0.5 h-4 w-4 shrink-0 accent-sky-700 ${focusRing}`}
        />
        <label htmlFor={id} className="text-sm text-slate-800">
          {label}
        </label>
      </div>
      {hint && (
        <p id={hintId} className="ps-6 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="ps-6 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}

export default CheckboxField
