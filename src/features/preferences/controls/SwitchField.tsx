import { useId, type ReactNode } from 'react'
import { focusRing } from '../../shared/focusRing'
import FieldHint from './FieldHint'

interface SwitchFieldProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** After the label, e.g. a "coming soon" badge. */
  badge?: ReactNode
}

/** An on / off preference: a switch (button with role="switch") named by its label. */
function SwitchField({ label, hint, checked, onChange, disabled, badge }: SwitchFieldProps) {
  const labelId = useId()
  const hintId = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span id={labelId} className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
          {label}
          {badge}
        </span>
        {hint !== undefined && <FieldHint id={hintId}>{hint}</FieldHint>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint === undefined ? undefined : hintId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-muted'
        } ${focusRing}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4.5 w-4.5 rounded-full bg-surface shadow-sm ring-1 ring-border-strong transition-transform ${
            checked ? 'translate-x-5.5 rtl:-translate-x-5.5' : 'translate-x-0.5 rtl:-translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export default SwitchField
