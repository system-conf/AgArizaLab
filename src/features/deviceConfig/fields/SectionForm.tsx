import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'

interface SectionFormProps {
  /** false = every control is disabled and the buttons are hidden. */
  editable: boolean
  onSubmit: () => void
  onDiscard: () => void
  children: ReactNode
}

/** Form of one settings card: a disabled-able fieldset plus Save / Undo changes. */
function SectionForm({ editable, onSubmit, onDiscard, children }: SectionFormProps) {
  const { t } = useTranslation('deviceConfig')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-w-0 flex-col gap-3">
      <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-3">
        {children}
      </fieldset>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={`rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 ${focusRing}`}
          >
            {t('actions.save')}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className={`rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${focusRing}`}
          >
            {t('actions.discard')}
          </button>
        </div>
      )}
    </form>
  )
}

export default SectionForm
