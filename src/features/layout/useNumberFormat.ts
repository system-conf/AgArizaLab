import { useMemo } from 'react'
import { useLanguage } from '../../i18n'

/** Formats whole numbers for the active UI language (Intl.NumberFormat). */
export function useNumberFormat(): (value: number) => string {
  const { language } = useLanguage()
  return useMemo(() => {
    const formatter = new Intl.NumberFormat(language)
    return (value: number) => formatter.format(value)
  }, [language])
}
