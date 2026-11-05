import { Check } from 'lucide-react'

interface SavedBadgeProps {
  visible: boolean
}

/** Short "Kaydedildi" confirmation; the live region stays mounted so screen readers announce it. */
function SavedBadge({ visible }: SavedBadgeProps) {
  return (
    <span role="status" aria-live="polite" className="text-xs">
      {visible && (
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 ring-1 ring-emerald-200">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Kaydedildi
        </span>
      )}
    </span>
  )
}

export default SavedBadge
