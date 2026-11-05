import { MousePointerClick, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import { useMediaQuery } from '../shared/useMediaQuery'

/** Tailwind's `md` breakpoint (48rem = 768px): from here on the panel sits beside the map. */
const wideQuery = '(min-width: 48rem)'

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
 * Exercise screen layout. Desktop: map on the start side, device panel on the end side.
 * Phone (<768px): map on top, the device panel slides up as a bottom sheet over it; while the
 * sheet is open the footer (notes, verify, failed checks) is its fixed bottom bar, so verifying
 * never requires closing the panel. The map section is an unstyled flex column; on desktop it
 * stretches to the row height, so a map that uses `md:h-full` fills it. The map draws its own frame.
 */
function AppLayout({ header, complaint, map, panel, footer, onClosePanel }: AppLayoutProps) {
  const { t } = useTranslation('exercise')
  const isWide = useMediaQuery(wideQuery)
  const hasPanel = panel !== null
  const footerInSheet = hasPanel && !isWide

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800 md:h-screen">
      {header}
      <div className="px-3 pt-3 sm:px-4">{complaint}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:px-4 md:flex-row">
        <section
          aria-label={t('layout.mapRegion')}
          className="relative flex min-w-0 flex-col md:min-h-0 md:flex-1"
        >
          {map}
        </section>
        <aside
          aria-label={t('layout.panelRegion')}
          className={`${hasPanel ? 'flex' : 'hidden md:flex'} fixed inset-x-0 bottom-0 z-20 max-h-[85vh] flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.14)] md:static md:z-auto md:max-h-none md:w-[26rem] md:shrink-0 md:rounded-2xl md:border md:shadow-sm`}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            {hasPanel ? (
              <>
                <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-2 flex items-center justify-between bg-white px-4 pb-1 pt-2 md:hidden">
                  <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" />
                  <button
                    type="button"
                    onClick={onClosePanel}
                    className={`absolute end-3 top-1.5 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 ${focusRing}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    {t('layout.closePanel')}
                  </button>
                </div>
                {panel}
              </>
            ) : (
              <div className="m-auto flex max-w-60 flex-col items-center gap-3 text-center text-sm text-slate-500">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                  <MousePointerClick className="h-7 w-7" aria-hidden="true" />
                </span>
                {t('layout.selectDevice')}
              </div>
            )}
          </div>
          {footerInSheet && <div className="max-h-[45vh] shrink-0 overflow-y-auto">{footer}</div>}
        </aside>
      </div>
      {!footerInSheet && footer}
    </div>
  )
}

export default AppLayout
