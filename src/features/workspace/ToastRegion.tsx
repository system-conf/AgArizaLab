import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import type { Toast, ToastTone } from './useToasts'

interface ToastRegionProps {
  toasts: readonly Toast[]
  onDismiss: (id: number) => void
}

const TONE_CLASSES: Readonly<Record<ToastTone, string>> = {
  info: 'border-slate-200 bg-white text-slate-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
}

const TONE_ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert } as const

/** Bottom-centre message stack; announced politely to screen readers. */
function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  const { t } = useTranslation('workspace')
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-3"
    >
      {toasts.map((toast) => {
        const Icon = TONE_ICONS[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-md ${TONE_CLASSES[toast.tone]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{toast.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label={t('toast.dismiss')}
              className={`rounded p-0.5 opacity-70 hover:opacity-100 ${focusRing}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default ToastRegion
