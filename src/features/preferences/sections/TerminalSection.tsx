import { useTranslation } from 'react-i18next'
import { TERMINAL_FONT_SIZE, TERMINAL_HISTORY_LENGTH, usePreference } from '../../../preferences'
import { FIELD_LIST } from '../controls/fieldList'
import NumberField from '../controls/NumberField'
import SelectField from '../controls/SelectField'
import SwitchField from '../controls/SwitchField'

const FONT_SIZES = Array.from({ length: TERMINAL_FONT_SIZE.max - TERMINAL_FONT_SIZE.min + 1 }, (_, index) => TERMINAL_FONT_SIZE.min + index)

/** Terminal / CLI: the CLI tab as default for network devices, font size, history length. */
function TerminalSection() {
  const { t } = useTranslation('preferences')
  const [cliDefault, setCliDefault] = usePreference('terminal.cliDefaultForNetworkDevices')
  const [fontSize, setFontSize] = usePreference('terminal.fontSize')
  const [historyLength, setHistoryLength] = usePreference('terminal.historyLength')

  return (
    <div className={FIELD_LIST}>
      <SwitchField label={t('terminal.cliDefault.label')} hint={t('terminal.cliDefault.hint')} checked={cliDefault} onChange={setCliDefault} />
      <SelectField
        label={t('terminal.fontSize.label')}
        choices={FONT_SIZES.map((size) => ({ value: size, label: t('terminal.fontSize.option', { size }) }))}
        value={fontSize}
        onChange={setFontSize}
      />
      <NumberField
        label={t('terminal.historyLength.label')}
        hint={t('terminal.historyLength.hint')}
        value={historyLength}
        min={TERMINAL_HISTORY_LENGTH.min}
        max={TERMINAL_HISTORY_LENGTH.max}
        invalidText={t('terminal.historyLength.invalid', TERMINAL_HISTORY_LENGTH)}
        onChange={setHistoryLength}
      />
    </div>
  )
}

export default TerminalSection
