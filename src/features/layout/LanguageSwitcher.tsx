import { Languages } from 'lucide-react'
import { useId, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../i18n'
import { isLanguageCode } from '../../i18n/languages'
import { focusRing } from '../shared/focusRing'

/**
 * Header control to switch the UI language: a labelled native select (keyboard and screen reader
 * friendly, compact enough for 360 px). Language names are shown in their own language.
 */
function LanguageSwitcher() {
  const { t } = useTranslation('common')
  const { language, languages, changeLanguage } = useLanguage()
  const selectId = useId()

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value
    if (!isLanguageCode(code)) return
    changeLanguage(code).catch((error: unknown) => {
      console.error(`Could not switch the language to ${code}`, error)
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <label htmlFor={selectId} className="flex items-center text-slate-500">
        <Languages className="hidden h-4 w-4 sm:block" aria-hidden="true" />
        <span className="sr-only">{t('languageSwitcher.label')}</span>
      </label>
      <select
        id={selectId}
        value={language}
        onChange={handleChange}
        className={`h-9 rounded-lg border border-slate-300 bg-white ps-2 pe-1 text-sm text-slate-700 hover:bg-slate-50 ${focusRing}`}
      >
        {languages.map((option) => (
          <option key={option.code} value={option.code} lang={option.code}>
            {option.nativeName}
          </option>
        ))}
      </select>
    </div>
  )
}

export default LanguageSwitcher
