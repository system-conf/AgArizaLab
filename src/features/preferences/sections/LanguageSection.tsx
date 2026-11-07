import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../../i18n'
import { isLanguageCode } from '../../../i18n/languages'
import ChoiceGroup from '../controls/ChoiceGroup'

/** Language: the same switch as the header's (i18next keeps the choice under its own key). */
function LanguageSection() {
  const { t } = useTranslation('preferences')
  const { language, languages, changeLanguage } = useLanguage()

  function choose(code: string) {
    if (!isLanguageCode(code)) return
    changeLanguage(code).catch((error: unknown) => {
      console.error(`Could not switch the language to ${code}`, error)
    })
  }

  return (
    <ChoiceGroup<string>
      label={t('language.label')}
      hint={t('language.hint')}
      choices={languages.map((info) => ({ value: info.code, label: info.nativeName }))}
      value={language}
      onChange={choose}
    />
  )
}

export default LanguageSection
