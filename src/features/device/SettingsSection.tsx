import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  children: ReactNode
}

/** A titled block inside the device panel tabs. */
function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-2 border-b border-slate-100 pb-4 last:border-b-0">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  )
}

export default SettingsSection
