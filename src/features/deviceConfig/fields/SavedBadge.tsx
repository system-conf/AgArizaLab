import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SavedBadgeProps {
  visible: boolean
}

/** Short "Saved" confirmation; the live region stays mounted so screen readers announce it. */
function SavedBadge({ visible }: SavedBadgeProps) {
  const { t } = useTranslation('device')
  return (
    <span role="status" aria-live="polite" className="text-xs">
      {visible && (
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 font-medium text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-800">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {t('saved')}
        </span>
      )}
    </span>
  )
}

export default SavedBadge
