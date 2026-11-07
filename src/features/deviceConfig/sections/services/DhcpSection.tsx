import { Server } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CheckboxField from '../../fields/CheckboxField'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import SectionCard from '../../fields/SectionCard'
import SectionForm from '../../fields/SectionForm'
import { useShownErrors } from '../../fields/useShownErrors'
import { DhcpPoolFormModel, type DhcpDraft, type DhcpPoolDraft, type ExcludedRangeDraft } from '../../model/DhcpPoolFormModel'
import { patchAt, removeAt } from '../../model/formTypes'
import { fieldGrid, type SectionProps } from '../sectionTypes'
import DhcpPoolFields from './DhcpPoolFields'

/** DHCP server: on/off, pools and excluded addresses. A device without a server gets one on save. */
function DhcpSection({ device, access, saved, onSave }: SectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [draft, setDraft] = useState<DhcpDraft>(() => DhcpPoolFormModel.toDraft(device.services?.dhcp))
  const errors = useShownErrors()
  const validation = DhcpPoolFormModel.validate(draft)
  const setPools = (change: (pools: DhcpPoolDraft[]) => DhcpPoolDraft[]) => setDraft((current) => ({ ...current, pools: change(current.pools) }))
  const setExcluded = (change: (rows: ExcludedRangeDraft[]) => ExcludedRangeDraft[]) =>
    setDraft((current) => ({ ...current, excluded: change(current.excluded) }))

  function submit() {
    errors.markSubmitted()
    if (!DhcpPoolFormModel.isValid(validation)) return
    onSave({ ...device, services: { ...device.services, dhcp: DhcpPoolFormModel.apply(draft) } })
  }

  function discard() {
    setDraft(DhcpPoolFormModel.toDraft(device.services?.dhcp))
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.dhcp')} icon={Server} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <CheckboxField label={t('dhcp.enabled')} checked={draft.enabled} onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} />
        <h4 className="text-sm font-medium text-fg">{t('dhcp.pools')}</h4>
        <RowList
          items={draft.pools}
          keyOf={(row) => row.key}
          titleOf={(row) => (row.name.trim() === '' ? t('dhcp.newPool') : t('dhcp.poolItem', { name: row.name.trim() }))}
          emptyText={t('dhcp.emptyPools')}
          addLabel={t('dhcp.addPool')}
          onAdd={() => setPools((pools) => [...pools, DhcpPoolFormModel.newPool(pools)])}
          removeLabelOf={(row) => t('dhcp.removePool', { name: row.name.trim() })}
          onRemove={(index) => setPools((pools) => removeAt(pools, index))}
          renderRow={(row, index) => (
            <DhcpPoolFields
              row={row}
              errors={validation.pools[index] ?? {}}
              show={errors.show}
              onChange={(change) => setPools((pools) => patchAt(pools, index, change))}
            />
          )}
        />
        <h4 className="text-sm font-medium text-fg">{t('dhcp.excluded')}</h4>
        <RowList
          items={draft.excluded}
          keyOf={(row) => row.key}
          titleOf={(_, index) => t('dhcp.excludedItem', { index: index + 1 })}
          emptyText={t('dhcp.emptyExcluded')}
          addLabel={t('dhcp.addExcluded')}
          onAdd={() => setExcluded((rows) => [...rows, DhcpPoolFormModel.newExcluded()])}
          removeLabelOf={(_, index) => t('dhcp.removeExcluded', { index: index + 1 })}
          onRemove={(index) => setExcluded((rows) => removeAt(rows, index))}
          renderRow={(row, index) => {
            const rowErrors = validation.excluded[index] ?? {}
            const patch = (change: Partial<ExcludedRangeDraft>) => setExcluded((rows) => patchAt(rows, index, change))
            return (
              <div className={fieldGrid}>
                <InputField label={t('dhcp.excludedStart')} type="address" value={row.start} onChange={(start) => patch({ start })} error={errors.show(rowErrors.start)} />
                <InputField label={t('dhcp.excludedEnd')} type="address" value={row.end} onChange={(end) => patch({ end })} error={errors.show(rowErrors.end)} />
              </div>
            )
          }}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default DhcpSection
