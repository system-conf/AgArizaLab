import { useTranslation } from 'react-i18next'
import InputField from '../../fields/InputField'
import SelectField from '../../fields/SelectField'
import { pick } from '../../model/formTypes'
import { ALLOWED_CHOICES, SWITCHPORT_MODES, type PortDraft, type PortErrors } from '../../model/PortEditorModel'
import { fieldGrid, type ShowError } from '../sectionTypes'

interface SwitchportFieldsProps {
  draft: PortDraft
  errors: PortErrors
  show: ShowError
  onChange: (patch: Partial<PortDraft>) => void
}

const [ALLOWED_ALL, ALLOWED_LIST] = ALLOWED_CHOICES
const allowedLabels = { all: 'port.allowedAll', list: 'port.allowedList' } as const

/** `switchport mode`, access VLAN, or native VLAN + allowed VLANs of a trunk. */
function SwitchportFields({ draft, errors, show, onChange }: SwitchportFieldsProps) {
  const { t } = useTranslation('deviceConfig')
  return (
    <div className={fieldGrid}>
      <SelectField
        label={t('port.mode')}
        value={draft.mode}
        options={SWITCHPORT_MODES.map((mode) => ({ value: mode, label: t(`port.modes.${mode}`) }))}
        onChange={(value) => {
          const mode = pick(SWITCHPORT_MODES, value)
          if (mode) onChange({ mode })
        }}
      />
      {draft.mode === 'access' && (
        <InputField
          label={t('port.accessVlan')}
          type="number"
          value={draft.accessVlan}
          onChange={(accessVlan) => onChange({ accessVlan })}
          error={show(errors.fields.accessVlan)}
        />
      )}
      {draft.mode === 'trunk' && (
        <>
          <InputField
            label={t('port.nativeVlan')}
            type="number"
            value={draft.nativeVlan}
            onChange={(nativeVlan) => onChange({ nativeVlan })}
            error={show(errors.fields.nativeVlan)}
          />
          <SelectField
            label={t('port.allowedVlans')}
            value={draft.allowedAll ? ALLOWED_ALL : ALLOWED_LIST}
            options={ALLOWED_CHOICES.map((choice) => ({ value: choice, label: t(allowedLabels[choice]) }))}
            onChange={(value) => onChange({ allowedAll: value === ALLOWED_ALL })}
          />
          {!draft.allowedAll && (
            <InputField
              label={t('port.allowedListLabel')}
              type="code"
              value={draft.allowedList}
              onChange={(allowedList) => onChange({ allowedList })}
              hint={t('port.allowedListHint')}
              error={show(errors.fields.allowedList)}
            />
          )}
        </>
      )}
    </div>
  )
}

export default SwitchportFields
