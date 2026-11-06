import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Shown while a lazily loaded screen (workspace, exercise) is being downloaded. */
function LoadingScreen() {
  const { t } = useTranslation('common')
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center gap-2 bg-slate-50 text-sm text-slate-600">
      <LoaderCircle className="h-5 w-5 animate-spin text-sky-700 motion-reduce:animate-none" aria-hidden="true" />
      {t('loading')}
    </div>
  )
}

export default LoadingScreen
