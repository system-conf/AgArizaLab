import { useTranslation } from 'react-i18next'
import { usePreference } from '../../../preferences'
import { FIELD_LIST } from '../controls/fieldList'
import SwitchField from '../controls/SwitchField'
import LocalDataFields from './LocalDataFields'
import PreferencesFileField from './PreferencesFileField'

/** Data: autosave of the free lab, the preferences file, progress reset and clearing local data. */
function DataSection() {
  const { t } = useTranslation('preferences')
  const [autosave, setAutosave] = usePreference('data.autosave')

  return (
    <div className={FIELD_LIST}>
      <SwitchField label={t('data.autosave.label')} hint={t('data.autosave.hint')} checked={autosave} onChange={setAutosave} />
      <PreferencesFileField />
      <LocalDataFields />
    </div>
  )
}

export default DataSection
