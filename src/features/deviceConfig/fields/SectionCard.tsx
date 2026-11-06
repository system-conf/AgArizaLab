import { Lock, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import SavedBadge from '../../device/SavedBadge'
import SettingsSection from '../../device/SettingsSection'
import type { ConfigAccess } from '../model/ConfigLocks'

interface SectionCardProps {
  title: string
  icon: LucideIcon
  access: ConfigAccess
  /** Show the "Saved" confirmation. */
  saved: boolean
  children: ReactNode
}

/** A settings card with the Saved badge and, when locked, a read-only marker. */
function SectionCard({ title, icon, access, saved, children }: SectionCardProps) {
  const { t } = useTranslation('deviceConfig')
  const status = (
    <span className="flex items-center gap-2">
      {access === 'readOnly' && (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t('panel.lockedReadOnly')}
        </span>
      )}
      <SavedBadge visible={saved} />
    </span>
  )
  return (
    <SettingsSection title={title} icon={icon} status={status}>
      {children}
    </SettingsSection>
  )
}

export default SectionCard
