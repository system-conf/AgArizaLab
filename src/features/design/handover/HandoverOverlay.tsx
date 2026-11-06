import { FileDown, Printer, X } from 'lucide-react'
import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { HandoverPack, type HandoverBrief, type HandoverSource } from '../../../design'
import { useMessageTranslator } from '../../../i18n'
import { focusRing } from '../../shared/focusRing'
import { downloadMarkdown, handoverFileName } from './handoverDownload'
import HandoverPageView from './HandoverPageView'
import HandoverTopology from './HandoverTopology'

export interface HandoverOverlayProps {
  /** The lab to document. */
  source: HandoverSource
  /** The brief the lab was built for (requirements, customer devices, cost); absent in a free lab. */
  brief?: HandoverBrief
  onClose: () => void
}

/** While the pack is open, printing shows only the pack (the app under it is hidden). */
const PRINT_CSS = '@media print { body > #root { display: none !important; } }'

const toolbarButton = `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${focusRing}`

/**
 * The handover pack ("Teslim dosyası") of a lab as a full-screen printable page (HandoverPack +
 * HandoverLayout), with Print and a Markdown download.
 */
function HandoverOverlay({ source, brief, onClose }: HandoverOverlayProps) {
  const { t } = useTranslation('design')
  const translate = useMessageTranslator()
  const document_ = useMemo(() => HandoverPack.build(source, brief ? { brief } : {}), [brief, source])
  const page = useMemo(() => HandoverPack.page(document_), [document_])

  function download() {
    downloadMarkdown(HandoverPack.toMarkdown(document_, translate), handoverFileName(source.meta.title, t('ui.handover.fileName')))
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.handover.title')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-100 print:static print:overflow-visible print:bg-white"
    >
      <style>{PRINT_CSS}</style>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur print:hidden">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{t('ui.handover.title')}</h2>
        <button type="button" onClick={() => window.print()} className={`${toolbarButton} bg-sky-700 text-white hover:bg-sky-800`}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('ui.handover.print')}</span>
          <span className="sr-only sm:hidden">{t('ui.handover.print')}</span>
        </button>
        <button type="button" onClick={download} className={`${toolbarButton} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('ui.handover.markdown')}</span>
          <span className="sr-only sm:hidden">{t('ui.handover.markdown')}</span>
        </button>
        <button
          type="button"
          // The pack was opened on purpose; its close button takes the focus.
          autoFocus
          onClick={onClose}
          aria-label={t('ui.handover.close')}
          title={t('ui.handover.close')}
          className={`rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 ${focusRing}`}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="p-3 sm:p-6 print:p-0">
        <div className="mx-auto max-w-4xl rounded-xl bg-white p-4 shadow-sm sm:p-8 print:rounded-none print:p-0 print:shadow-none">
          <HandoverPageView page={page} topology={<HandoverTopology source={source} />} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default HandoverOverlay
