import { MousePointerClick, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { focusRing } from '../shared/focusRing'

interface AppLayoutProps {
  header: ReactNode
  complaint: ReactNode
  map: ReactNode
  /** Device panel content; null when no device is selected. */
  panel: ReactNode | null
  footer: ReactNode
  /** Closes the panel (clears the selection); used by the phone bottom sheet. */
  onClosePanel: () => void
}

/**
 * Game screen layout. Desktop: map on the left, device panel on the right.
 * Phone (<768px): map on top, the device panel slides up as a bottom sheet over it.
 */
function AppLayout({ header, complaint, map, panel, footer, onClosePanel }: AppLayoutProps) {
  const hasPanel = panel !== null

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800 md:h-screen">
      {header}
      <div className="px-4 py-3">{complaint}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 md:flex-row">
        <section aria-label="Ağ haritası" className="min-w-0 md:flex-1 md:overflow-auto">
          {map}
        </section>
        <aside
          aria-label="Cihaz paneli"
          className={`${hasPanel ? 'flex' : 'hidden md:flex'} fixed inset-x-0 bottom-0 z-20 max-h-[70vh] flex-col overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] md:static md:z-auto md:max-h-none md:w-[26rem] md:shrink-0 md:rounded-xl md:border md:shadow-sm`}
        >
          {hasPanel ? (
            <>
              <div className="mb-2 flex justify-end md:hidden">
                <button
                  type="button"
                  onClick={onClosePanel}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 ${focusRing}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Kapat
                </button>
              </div>
              {panel}
            </>
          ) : (
            <div className="m-auto flex flex-col items-center gap-2 text-center text-sm text-slate-500">
              <MousePointerClick className="h-8 w-8" aria-hidden="true" />
              Ayrıntıları görmek için haritada bir cihaza tıklayın.
            </div>
          )}
        </aside>
      </div>
      {footer}
    </div>
  )
}

export default AppLayout
