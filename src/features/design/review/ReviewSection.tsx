import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface ReviewSectionProps {
  id: string
  title: string
  icon?: LucideIcon
  children: ReactNode
}

/** A card of the design review with a heading. */
function ReviewSection({ id, title, icon: Icon, children }: ReviewSectionProps) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:shadow-none">
      <h2 id={id} className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  )
}

export default ReviewSection
