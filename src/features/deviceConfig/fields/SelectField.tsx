import { useId } from 'react'
import { focusRing } from '../../shared/focusRing'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps {
  label: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  error?: string
  hint?: string
}

/** Labelled select of the device configuration forms. */
function SelectField({ label, value, options, onChange, error, hint }: SelectFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter((part) => part !== '').join(' ')

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        className={`w-full min-w-0 rounded-md border bg-surface px-2 py-1.5 text-sm disabled:bg-surface-muted disabled:text-fg-subtle ${
          error ? 'border-rose-400' : 'border-border-strong'
        } ${focusRing}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  )
}

export default SelectField
