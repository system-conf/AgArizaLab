import { useId } from 'react'
import { focusRing } from '../../shared/focusRing'
import type { Choice } from './ChoiceGroup'
import FieldHint from './FieldHint'

interface SelectFieldProps<Value> {
  label: string
  hint?: string
  choices: readonly Choice<Value>[]
  value: Value
  onChange: (value: Value) => void
}

/** One of many options as a labelled native select (compact on phones, full keyboard support). */
function SelectField<Value extends string | number>({ label, hint, choices, value, onChange }: SelectFieldProps<Value>) {
  const selectId = useId()
  const hintId = useId()
  const index = choices.findIndex((choice) => choice.value === value)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-fg">
        {label}
      </label>
      <select
        id={selectId}
        value={index}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(event) => {
          const choice = choices[Number(event.target.value)]
          if (choice) onChange(choice.value)
        }}
        className={`h-9 w-full max-w-xs rounded-lg border border-border-strong bg-surface ps-2 pe-1 text-sm text-fg ${focusRing}`}
      >
        {choices.map((choice, position) => (
          <option key={choice.value} value={position}>
            {choice.label}
          </option>
        ))}
      </select>
      {hint !== undefined && <FieldHint id={hintId}>{hint}</FieldHint>}
    </div>
  )
}

export default SelectField
