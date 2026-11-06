import { Link } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { END_DEVICE_KINDS, type DeviceKindV2, type HostSettings } from '../../../domain/v2'
import InputField from '../fields/InputField'
import RowList from '../fields/RowList'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import SelectField from '../fields/SelectField'
import { useShownErrors } from '../fields/useShownErrors'
import { anyRowErrors, patchAt, removeAt } from '../model/formTypes'
import { HostSettingsModel, MAX_APP_LINK_LABEL, type AppLinkDraft } from '../model/HostSettingsModel'
import { fieldGrid, type SectionProps } from './sectionTypes'

interface AppLinksSectionProps extends SectionProps {
  host: HostSettings
}

/** App links target end devices; a stored target of another kind stays selectable. */
function targetKinds(current: DeviceKindV2): DeviceKindV2[] {
  return END_DEVICE_KINDS.includes(current) ? [...END_DEVICE_KINDS] : [...END_DEVICE_KINDS, current]
}

/** Application dependencies of an end device on other addresses (printer, cameras…). */
function AppLinksSection({ device, host, access, saved, onSave }: AppLinksSectionProps) {
  const { t } = useTranslation(['deviceConfig', 'catalog'])
  const [rows, setRows] = useState<AppLinkDraft[]>(() => HostSettingsModel.appLinkDrafts(host))
  const errors = useShownErrors()
  const validation = HostSettingsModel.validateAppLinks(rows)
  const patch = (index: number, change: Partial<AppLinkDraft>) => setRows((current) => patchAt(current, index, change))

  function submit() {
    errors.markSubmitted()
    if (anyRowErrors(validation)) return
    onSave({ ...device, host: HostSettingsModel.applyAppLinks(rows, host) })
  }

  function discard() {
    setRows(HostSettingsModel.appLinkDrafts(host))
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.appLinks')} icon={Link} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <RowList
          items={rows}
          keyOf={(row) => row.key}
          titleOf={(_, index) => t('appLinks.item', { index: index + 1 })}
          emptyText={t('appLinks.empty')}
          addLabel={t('appLinks.add')}
          onAdd={() => setRows((current) => [...current, HostSettingsModel.newAppLink()])}
          removeLabelOf={(_, index) => t('appLinks.remove', { index: index + 1 })}
          onRemove={(index) => setRows((current) => removeAt(current, index))}
          renderRow={(row, index) => (
            <div className={fieldGrid}>
              <InputField
                label={t('appLinks.label')}
                value={row.label}
                onChange={(label) => patch(index, { label })}
                maxLength={MAX_APP_LINK_LABEL * 2}
                error={errors.show(validation[index]?.label)}
              />
              <InputField
                label={t('appLinks.targetIp')}
                type="address"
                value={row.targetIp}
                onChange={(targetIp) => patch(index, { targetIp })}
                error={errors.show(validation[index]?.targetIp)}
              />
              <SelectField
                label={t('appLinks.targetKind')}
                value={row.targetKind}
                options={targetKinds(row.targetKind).map((kind) => ({ value: kind, label: t(`catalog:kinds.${kind}`) }))}
                onChange={(value) => {
                  const targetKind = targetKinds(row.targetKind).find((kind) => kind === value)
                  if (targetKind) patch(index, { targetKind })
                }}
              />
            </div>
          )}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default AppLinksSection
