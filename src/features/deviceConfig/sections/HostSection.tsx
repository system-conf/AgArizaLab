import { Globe } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HostSettings } from '../../../domain/v2'
import InputField from '../fields/InputField'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import { useShownErrors } from '../fields/useShownErrors'
import { hasErrors } from '../model/formTypes'
import { HostSettingsModel, type HostDraft } from '../model/HostSettingsModel'
import { fieldGrid, type SectionProps } from './sectionTypes'

interface HostSectionProps extends SectionProps {
  host: HostSettings
}

const fields = [
  { field: 'gateway', labelKey: 'host.gateway' },
  { field: 'dnsPrimary', labelKey: 'host.dnsPrimary' },
  { field: 'dnsSecondary', labelKey: 'host.dnsSecondary' },
] as const satisfies readonly { field: keyof HostDraft; labelKey: `host.${keyof HostDraft}` }[]

/** Default gateway and DNS servers of an end device (DHCP overwrites them on a lease). */
function HostSection({ device, host, access, saved, onSave }: HostSectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [draft, setDraft] = useState<HostDraft>(() => HostSettingsModel.toDraft(host))
  const errors = useShownErrors()
  const validation = HostSettingsModel.validate(draft)

  function submit() {
    errors.markSubmitted()
    if (hasErrors(validation)) return
    onSave({ ...device, host: HostSettingsModel.apply(draft, host) })
  }

  function discard() {
    setDraft(HostSettingsModel.toDraft(host))
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.host')} icon={Globe} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <div className={fieldGrid}>
          {fields.map(({ field, labelKey }) => (
            <InputField
              key={field}
              label={t(labelKey)}
              type="address"
              value={draft[field]}
              onChange={(value) => setDraft((current) => ({ ...current, [field]: value }))}
              error={errors.show(validation[field])}
            />
          ))}
        </div>
      </SectionForm>
    </SectionCard>
  )
}

export default HostSection
