import { Panel } from '@xyflow/react'
import { MailPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PduToolState } from './model/SimplePduTool'

interface SimplePduHintProps {
  state: PduToolState
  nameOf: (deviceId: string) => string
}

/** What the Simple PDU tool expects next, at the top of the canvas (also announced to screen readers). */
function SimplePduHint({ state, nameOf }: SimplePduHintProps) {
  const { t } = useTranslation('simulation')
  if (state.kind === 'off') return null
  const text = state.kind === 'source' ? t('ui.pduTool.pickSource') : t('ui.pduTool.pickDestination', { device: nameOf(state.sourceId) })

  return (
    <Panel position="top-center" className="pointer-events-none max-w-[calc(100%-1rem)]">
      <p role="status" className="flex items-center gap-2 rounded-full border border-violet-200 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm sm:text-sm">
        <MailPlus className="h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />
        <span>{text}</span>
        <span className="hidden whitespace-nowrap border-s border-slate-200 ps-2 text-slate-400 sm:inline">{t('ui.pduTool.escape')}</span>
      </p>
    </Panel>
  )
}

export default SimplePduHint
