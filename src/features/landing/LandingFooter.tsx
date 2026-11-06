import { CodeXml } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { siteInfo } from '../layout/siteInfo'
import { focusRing } from '../shared/focusRing'

/** Start page footer: license, author and source code link. */
function LandingFooter() {
  const { t } = useTranslation(['landing', 'common'])

  return (
    <footer className="flex flex-col items-center gap-2 border-t border-slate-200 pt-6 text-center text-sm text-slate-500 sm:flex-row sm:justify-between sm:text-start">
      <p>{t('footer.license', { license: siteInfo.license, author: siteInfo.author })}</p>
      <a
        href={siteInfo.repositoryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
      >
        <CodeXml className="h-4 w-4" aria-hidden="true" />
        {t('footer.sourceCode')}{' '}
        <span className="sr-only">{t('common:opensInNewTab')}</span>
      </a>
    </footer>
  )
}

export default LandingFooter
