import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'
import RecentLabList from '../../shared/RecentLabList'
import { useRecentLabs } from '../../shared/useRecentLabs'

interface RecentLabsDialogProps {
  onOpen: (labId: string) => void
  onClose: () => void
}

/** Modal list of the labs saved in this browser (File → Open recent lab). */
function RecentLabsDialog({ onOpen, onClose }: RecentLabsDialogProps) {
  const { t } = useTranslation(['workspace', 'lab'])
  const recent = useRecentLabs()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          onClose()
        }}
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 rounded-2xl bg-white p-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {t('lab:recent.title')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('workspace:recentDialog.close')}
            className={`rounded p-1 text-slate-500 hover:bg-slate-100 ${focusRing}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">
          <RecentLabList
            entries={recent.entries}
            loadingText={t('workspace:recentDialog.loading')}
            onOpen={(labId) => {
              onOpen(labId)
              onClose()
            }}
            onDelete={recent.remove}
          />
        </div>
      </div>
    </div>
  )
}

export default RecentLabsDialog
