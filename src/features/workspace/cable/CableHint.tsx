import { Panel } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import CableGlyph from './CableGlyph'
import type { CableToolState } from './CableToolState'

interface CableHintProps {
  state: CableToolState
  nameOf: (deviceId: string) => string
}

/** What the cable tool expects next, at the top of the canvas (also announced to screen readers). */
function CableHint({ state, nameOf }: CableHintProps) {
  const { t } = useTranslation('workspace')
  const tool = state.tool
  // The SSID dialog explains the last step itself.
  if (tool === null || state.step.kind === 'ssid') return null
  const cable = t(`cableTools.${tool}`)
  const first = state.firstEnd
  let text: string
  if (first !== null) text = t('cableHints.secondDevice', { cable, device: nameOf(first.deviceId), port: first.portId })
  else if (tool === 'serial') text = t('cableHints.firstDeviceSerial', { cable })
  else text = t('cableHints.firstDevice', { cable })

  return (
    <Panel position="top-center" className="pointer-events-none max-w-[calc(100%-1rem)]">
      <p
        role="status"
        className="flex items-center gap-2 rounded-full border border-sky-200 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm sm:text-sm"
      >
        <CableGlyph tool={tool} className="h-4 w-4 shrink-0" />
        <span>{text}</span>
        <span className="hidden whitespace-nowrap border-s border-slate-200 ps-2 text-slate-400 sm:inline">{t('cableHints.escape')}</span>
      </p>
    </Panel>
  )
}

export default CableHint
