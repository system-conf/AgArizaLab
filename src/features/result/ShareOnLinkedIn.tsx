import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../i18n'
import { linkedInShareUrl, siteUrlInLanguage } from '../layout/siteInfo'
import { focusRing } from '../shared/focusRing'

/**
 * Card that invites the learner to share the lab on LinkedIn (opens LinkedIn in a new tab).
 * The shared link carries `?lang=` so it opens in the language the learner used.
 */
function ShareOnLinkedIn() {
  const { t } = useTranslation(['results', 'common'])
  const { language } = useLanguage()

  return (
    <section className="flex flex-col items-start gap-3 rounded-2xl border border-sky-200 dark:border-sky-800 bg-accent-muted p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <h2 className="font-semibold text-fg-strong">{t('share.title')}</h2>
        <p className="mt-0.5 text-sm text-fg-muted">{t('share.text')}</p>
      </div>
      <a
        href={linkedInShareUrl(siteUrlInLanguage(language))}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex shrink-0 items-center gap-2 rounded-lg bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004182] ${focusRing}`}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {t('share.button')}{' '}
        <span className="sr-only">{t('common:opensInNewTab')}</span>
      </a>
    </section>
  )
}

export default ShareOnLinkedIn
