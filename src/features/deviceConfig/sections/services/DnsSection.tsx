import { BookUser } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CheckboxField from '../../fields/CheckboxField'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import SectionCard from '../../fields/SectionCard'
import SectionForm from '../../fields/SectionForm'
import { useShownErrors } from '../../fields/useShownErrors'
import { DnsServiceFormModel, type DnsDraft, type DnsRecordDraft } from '../../model/DnsServiceFormModel'
import { patchAt, removeAt } from '../../model/formTypes'
import { fieldGrid, type SectionProps } from '../sectionTypes'

/** DNS service: on/off, forwarders and A records. A device without the service gets it on save. */
function DnsSection({ device, access, saved, onSave }: SectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [draft, setDraft] = useState<DnsDraft>(() => DnsServiceFormModel.toDraft(device.services?.dns))
  const errors = useShownErrors()
  const validation = DnsServiceFormModel.validate(draft)
  const setRecords = (change: (records: DnsRecordDraft[]) => DnsRecordDraft[]) =>
    setDraft((current) => ({ ...current, records: change(current.records) }))

  function submit() {
    errors.markSubmitted()
    if (!DnsServiceFormModel.isValid(validation)) return
    onSave({ ...device, services: { ...device.services, dns: DnsServiceFormModel.apply(draft) } })
  }

  function discard() {
    setDraft(DnsServiceFormModel.toDraft(device.services?.dns))
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.dns')} icon={BookUser} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <CheckboxField label={t('dns.enabled')} checked={draft.enabled} onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} />
        <InputField
          label={t('dns.forwarders')}
          type="code"
          value={draft.forwarders}
          onChange={(forwarders) => setDraft((current) => ({ ...current, forwarders }))}
          hint={t('dns.forwardersHint')}
          error={errors.show(validation.forwarders)}
        />
        <h4 className="text-sm font-medium text-fg">{t('dns.records')}</h4>
        <RowList
          items={draft.records}
          keyOf={(row) => row.key}
          titleOf={(_, index) => t('dns.recordItem', { index: index + 1 })}
          emptyText={t('dns.emptyRecords')}
          addLabel={t('dns.addRecord')}
          onAdd={() => setRecords((records) => [...records, DnsServiceFormModel.newRecord()])}
          removeLabelOf={(_, index) => t('dns.removeRecord', { index: index + 1 })}
          onRemove={(index) => setRecords((records) => removeAt(records, index))}
          renderRow={(row, index) => {
            const rowErrors = validation.records[index] ?? {}
            const patch = (change: Partial<DnsRecordDraft>) => setRecords((records) => patchAt(records, index, change))
            return (
              <div className={fieldGrid}>
                <InputField label={t('dns.recordName')} type="code" value={row.name} onChange={(name) => patch({ name })} error={errors.show(rowErrors.name)} />
                <InputField
                  label={t('dns.recordAddress')}
                  type="address"
                  value={row.address}
                  onChange={(address) => patch({ address })}
                  error={errors.show(rowErrors.address)}
                />
              </div>
            )
          }}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default DnsSection
