import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import { usePreference } from '../../../preferences'
import { deviceLabelLines } from '../../preferences/model/preferenceWiring'
import { DeviceKindIcon } from '../labServices'
import type { CableHighlight, WorkspaceDeviceNode as DeviceNodeType } from './canvasTypes'

/** Invisible, centred handles: links run from icon centre to icon centre (as on the map). */
const hiddenHandle: CSSProperties = {
  top: '50%',
  left: '50%',
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  opacity: 0,
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
}

const HIGHLIGHT_CLASSES: Readonly<Record<CableHighlight, string>> = {
  none: '',
  usable: 'ring-4 ring-emerald-200 dark:ring-emerald-800 border-emerald-500',
  unusable: 'opacity-40',
  firstEnd: 'ring-4 ring-amber-200 dark:ring-amber-800 border-amber-500',
}

/**
 * A device on the workspace canvas: the node box is the icon (48 × 48), the name hangs below.
 * Same look as the exercise map's DeviceNode, plus cable-tool highlighting.
 */
function WorkspaceDeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const { device, modelName, cableHighlight } = data
  // PU (Preferences → Map): name, model, both or no label under the icon (the node's aria-label keeps the name).
  const [labelMode] = usePreference('map.deviceLabels')
  const labelLines = deviceLabelLines(labelMode, device.name, modelName)
  /** A powered-off device drops its category colour and takes the greyed text colour. */
  const iconTone = device.powered ? ('category' as const) : ('inherit' as const)
  const ring = cableHighlight !== 'none' ? HIGHLIGHT_CLASSES[cableHighlight] : ''
  const border = selected ? 'border-sky-600 dark:border-sky-400 ring-4 ring-sky-200 dark:ring-sky-800' : 'border-node-border hover:border-sky-400'

  return (
    <div className="relative h-12 w-12" title={modelName}>
      <Handle type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 bg-node shadow-sm transition group-data-[moving]/canvas:shadow-none group-focus-visible:ring-4 group-focus-visible:ring-sky-400 ${border} ${ring} ${
          device.powered ? 'text-fg' : 'text-slate-300 dark:text-slate-600'
        }`}
      >
        <DeviceKindIcon kind={device.kind} modelId={device.modelId} tone={iconTone} className="h-7 w-7" aria-hidden="true" />
      </span>
      <span
        className={`absolute end-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-node ${
          device.powered ? 'bg-emerald-500' : 'bg-slate-400'
        }`}
        aria-hidden="true"
      />
      {labelLines.length > 0 && (
        <span className="pointer-events-none absolute start-1/2 top-full mt-1 flex w-32 -translate-x-1/2 flex-col items-center text-center leading-tight rtl:translate-x-1/2">
          {labelLines.map((line, index) => (
            <span key={index} className={`rounded bg-canvas/90 px-1 text-xs ${index === 0 ? 'font-medium text-fg' : 'text-fg-muted'}`}>
              {line}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

export default memo(WorkspaceDeviceNode)
