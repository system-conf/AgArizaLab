import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  /** Small icon before the title. */
  icon?: LucideIcon
  /** Shown on the right of the title, e.g. a "Saved" badge. */
  status?: ReactNode
  children: ReactNode
}

/** A titled card inside the device panel tabs. */
function SettingsSection({ title, icon: Icon, status, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {Icon && <Icon className="h-4 w-4 text-sky-700" aria-hidden="true" />}
          {title}
        </h3>
        {status}
      </div>
      {children}
    </section>
  )
}

export default SettingsSection
