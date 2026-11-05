import { ControlButton, Controls, MiniMap, Panel } from '@xyflow/react'
import { Maximize, Minimize, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import type { FullscreenControls } from './useFullscreen'

interface MapControlsProps {
  fullscreen: FullscreenControls
  canResetLayout: boolean
  onResetLayout: () => void
}

const fitViewOptions = { padding: 0.2, duration: 200 }

/** Zoom / fit / fullscreen buttons, the minimap (not on phones) and "Reset layout". */
function MapControls({ fullscreen, canResetLayout, onResetLayout }: MapControlsProps) {
  const { t } = useTranslation('map')
  const fullscreenLabel = fullscreen.active ? t('controls.exitFullscreen') : t('controls.fullscreen')

  return (
    <>
      <Controls showInteractive={false} fitViewOptions={fitViewOptions} position="bottom-left">
        {fullscreen.supported && (
          <ControlButton onClick={fullscreen.toggle} title={fullscreenLabel} aria-label={fullscreenLabel}>
            {fullscreen.active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          </ControlButton>
        )}
      </Controls>
      <MiniMap
        className="hidden md:block"
        position="top-right"
        pannable
        zoomable
        nodeColor="#cbd5e1"
        nodeStrokeColor="#64748b"
        nodeBorderRadius={24}
      />
      <Panel position="top-left">
        <button
          type="button"
          onClick={onResetLayout}
          disabled={!canResetLayout}
          title={t('controls.resetLayoutTitle')}
          className={`flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {t('controls.resetLayout')}
        </button>
      </Panel>
    </>
  )
}

export default MapControls
