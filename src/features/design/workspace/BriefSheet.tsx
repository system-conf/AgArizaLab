import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'

interface BriefSheetProps {
  onClose: () => void
  children: ReactNode
}

/** The brief as a bottom sheet on narrow screens (below the side-panel breakpoint). */
function BriefSheet({ onClose, children }: BriefSheetProps) {
  const { t } = useTranslation('design')
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="designBriefSheetTitle"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        className="relative max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-slate-50 p-3 shadow-2xl sm:p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="designBriefSheetTitle" className="text-base font-semibold text-slate-900">
            {t('ui.brief.title')}
          </h2>
          <button
            type="button"
            // The sheet was opened on purpose; its close button takes the focus.
            autoFocus
            onClick={onClose}
            aria-label={t('ui.brief.close')}
            className={`rounded p-1 text-slate-500 hover:bg-slate-200 ${focusRing}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default BriefSheet
