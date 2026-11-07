import { useTranslation } from 'react-i18next'

/** Marks a stored preference whose behaviour is not built yet (docs/PREFERENCES.md §6). */
function ComingSoonBadge() {
  const { t } = useTranslation('preferences')
  return (
    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-muted ring-1 ring-border">
      {t('comingSoon')}
    </span>
  )
}

export default ComingSoonBadge
