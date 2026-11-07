import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import type { Toast, ToastTone } from './useToasts'

interface ToastRegionProps {
  toasts: readonly Toast[]
  onDismiss: (id: number) => void
}

const TONE_CLASSES: Readonly<Record<ToastTone, string>> = {
  info: 'border-border bg-surface text-fg',
  success: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200',
  error: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200',
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
