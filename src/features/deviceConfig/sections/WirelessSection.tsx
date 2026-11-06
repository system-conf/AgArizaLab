import { Wifi } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WirelessSettings } from '../../../domain/v2'
import InputField from '../fields/InputField'
import RowList from '../fields/RowList'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import SelectField from '../fields/SelectField'
import { useShownErrors } from '../fields/useShownErrors'
import { anyRowErrors, patchAt, removeAt } from '../model/formTypes'
import { MAX_SSID_LENGTH, SECURITY_MODES, SsidFormModel, type SsidDraft } from '../model/SsidFormModel'
import { fieldGrid, type SectionProps } from './sectionTypes'

interface WirelessSectionProps extends SectionProps {
  wireless: WirelessSettings
}

/** SSIDs of an access point / wireless router and the VLAN each one is bridged into. */
function WirelessSection({ device, wireless, access, saved, onSave }: WirelessSectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [rows, setRows] = useState<SsidDraft[]>(() => SsidFormModel.toDrafts(wireless))
  const errors = useShownErrors()
  const validation = SsidFormModel.validate(rows)
  const patch = (index: number, change: Partial<SsidDraft>) => setRows((current) => patchAt(current, index, change))

  function submit() {
    errors.markSubmitted()
    if (anyRowErrors(validation)) return
    onSave({ ...device, wireless: SsidFormModel.apply(rows, wireless) })
  }

  function discard() {
    setRows(SsidFormModel.toDrafts(wireless))
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.wireless')} icon={Wifi} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <RowList
          items={rows}
          keyOf={(row) => row.key}
          titleOf={(_, index) => t('wireless.item', { index: index + 1 })}
          emptyText={t('wireless.empty')}
          addLabel={t('wireless.add')}
          onAdd={() => setRows((current) => [...current, SsidFormModel.newDraft()])}
          removeLabelOf={(_, index) => t('wireless.remove', { index: index + 1 })}
          onRemove={(index) => setRows((current) => removeAt(current, index))}
          renderRow={(row, index) => (
            <div className={fieldGrid}>
              <InputField
                label={t('wireless.ssid')}
                value={row.ssid}
                onChange={(ssid) => patch(index, { ssid })}
                maxLength={MAX_SSID_LENGTH * 2}
                error={errors.show(validation[index]?.ssid)}
              />
              <InputField
                label={t('wireless.vlan')}
                type="number"
                value={row.vlan}
                onChange={(vlan) => patch(index, { vlan })}
                error={errors.show(validation[index]?.vlan)}
              />
              <SelectField
                label={t('wireless.security')}
                value={row.security}
                options={SECURITY_MODES.map((mode) => ({ value: mode, label: t(`wireless.securityModes.${mode}`) }))}
                onChange={(value) => {
                  const security = SECURITY_MODES.find((mode) => mode === value)
                  if (security) patch(index, { security })
                }}
              />
            </div>
          )}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default WirelessSection
