import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../i18n'

interface ComplaintCardProps {
  from: string
  message: string
}

/** First letters of up to two words, e.g. 'Şube müdürü' → 'ŞM' (case rules of `locale`). */
function initialsOf(name: string, locale: string): string {
  const letters = name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase(locale))
  return letters.join('') || '?'
}

/** The customer's complaint shown like an incoming message in a messaging app. */
function ComplaintCard({ from, message }: ComplaintCardProps) {
  const { t } = useTranslation('exercise')
  const { language } = useLanguage()

  return (
    <figure className="flex items-end gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-400 text-xs font-semibold text-white shadow-sm"
      >
        {initialsOf(from, language)}
      </span>
      <div className="relative max-w-2xl rounded-2xl rounded-es-md bg-surface px-4 py-2.5 shadow-sm ring-1 ring-border">
        <figcaption className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-orange-700 dark:text-orange-300">{from}</span>
          <span className="text-fg-subtle">{t('complaint.newMessage')}</span>
        </figcaption>
        <blockquote className="mt-0.5 text-sm leading-relaxed text-fg sm:text-base">{message}</blockquote>
      </div>
    </figure>
  )
}

export default ComplaintCard
