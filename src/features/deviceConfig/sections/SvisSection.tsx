import { Network } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SwitchingSettings } from '../../../domain'
import CheckboxField from '../fields/CheckboxField'
import InputField from '../fields/InputField'
import RowList from '../fields/RowList'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import { useShownErrors } from '../fields/useShownErrors'
import { anyRowErrors, patchAt, removeAt } from '../model/formTypes'
import { SviFormModel, type SviDraft, type SviSectionDraft } from '../model/SviFormModel'
import { fieldGrid, type SectionProps } from './sectionTypes'

interface SvisSectionProps extends SectionProps {
  switching: SwitchingSettings
}

/** `interface Vlan<n>` addresses and the switch's own `ip default-gateway`. */
function SvisSection({ device, switching, access, saved, onSave }: SvisSectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [draft, setDraft] = useState<SviSectionDraft>(() => SviFormModel.toDraft(switching))
  const errors = useShownErrors()
  const validation = SviFormModel.validate(draft)
  const setSvis = (change: (svis: SviDraft[]) => SviDraft[]) => setDraft((current) => ({ ...current, svis: change(current.svis) }))

  function submit() {
    errors.markSubmitted()
    if (anyRowErrors(validation.rows) || validation.defaultGateway) return
    onSave({ ...device, switching: SviFormModel.apply(draft, switching) })
  }

  function discard() {
    setDraft(SviFormModel.toDraft(switching))
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.svis')} icon={Network} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <RowList
          items={draft.svis}
          keyOf={(row) => row.key}
          titleOf={(row) => (row.original ? t('svis.item', { vlan: row.original.vlan }) : t('svis.newItem'))}
          emptyText={t('svis.empty')}
          addLabel={t('svis.add')}
          onAdd={() => setSvis((svis) => [...svis, SviFormModel.newDraft()])}
          removeLabelOf={(row) => t('svis.remove', { vlan: row.vlan })}
          onRemove={(index) => setSvis((svis) => removeAt(svis, index))}
          renderRow={(row, index) => {
            const rowErrors = validation.rows[index] ?? {}
            const patch = (change: Partial<SviDraft>) => setSvis((svis) => patchAt(svis, index, change))
            return (
              <div className={fieldGrid}>
                <InputField label={t('svis.vlan')} type="number" value={row.vlan} onChange={(vlan) => patch({ vlan })} error={errors.show(rowErrors.vlan)} />
                <div className="@md:pt-6">
                  <CheckboxField label={t('svis.adminUp')} checked={row.adminUp} onChange={(adminUp) => patch({ adminUp })} />
                </div>
                <InputField label={t('port.address')} type="address" value={row.address} onChange={(address) => patch({ address })} error={errors.show(rowErrors.address)} />
                <InputField label={t('port.mask')} type="address" value={row.mask} onChange={(mask) => patch({ mask })} error={errors.show(rowErrors.mask)} />
              </div>
            )
          }}
        />
        <InputField
          label={t('svis.defaultGateway')}
          type="address"
          value={draft.defaultGateway}
          onChange={(defaultGateway) => setDraft((current) => ({ ...current, defaultGateway }))}
          hint={t('svis.defaultGatewayHint')}
          error={errors.show(validation.defaultGateway)}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default SvisSection
