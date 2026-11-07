import { Power, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'
import InputField from '../fields/InputField'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import { useShownErrors } from '../fields/useShownErrors'
import type { ConfigAccess } from '../model/ConfigLocks'
import { GeneralFormModel, MAX_DEVICE_NAME } from '../model/GeneralFormModel'
import type { SectionProps } from './sectionTypes'

interface GeneralSectionProps extends SectionProps {
  /** Exercise lock of the 'power' section (the name follows `access`). */
  powerAccess: ConfigAccess
}

/** Device name (with Save) and the power switch (applies at once, like the real button). */
function GeneralSection({ device, access, powerAccess, saved, onSave }: GeneralSectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [name, setName] = useState(device.name)
  const errors = useShownErrors()
  const nameError = GeneralFormModel.nameError(name)

  function submit() {
    errors.markSubmitted()
    if (nameError) return
    onSave({ ...device, name: name.trim() })
  }

  function discard() {
    setName(device.name)
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.general')} icon={Settings} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <InputField label={t('general.name')} value={name} onChange={setName} error={errors.show(nameError)} maxLength={MAX_DEVICE_NAME * 2} />
      </SectionForm>
      {powerAccess !== 'hidden' && (
        <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
          <span className="text-sm font-medium text-fg">{t('general.power')}</span>
          <button
            type="button"
            aria-pressed={device.powered}
            disabled={powerAccess !== 'editable'}
            onClick={() => onSave({ ...device, powered: !device.powered })}
            className={`flex items-center gap-2 self-start rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
              device.powered
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                : 'border-border-strong bg-surface text-fg hover:bg-surface-subtle'
            } ${focusRing}`}
          >
            <Power className="h-4 w-4" aria-hidden="true" />
            {powerAccess === 'editable'
              ? device.powered
                ? t('general.powerOn')
                : t('general.powerOff')
              : device.powered
                ? t('info.on')
                : t('info.off')}
          </button>
        </div>
      )}
    </SectionCard>
  )
}

export default GeneralSection
