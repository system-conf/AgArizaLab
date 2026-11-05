import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
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
  usable: 'ring-4 ring-emerald-200 border-emerald-500',
  unusable: 'opacity-40',
  firstEnd: 'ring-4 ring-amber-200 border-amber-500',
}

/**
 * A device on the workspace canvas: the node box is the icon (48 × 48), the name hangs below.
 * Same look as the exercise map's DeviceNode, plus cable-tool highlighting.
 */
function WorkspaceDeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const { device, modelName, cableHighlight } = data
  const ring = cableHighlight !== 'none' ? HIGHLIGHT_CLASSES[cableHighlight] : ''
  const border = selected ? 'border-sky-600 ring-4 ring-sky-200' : 'border-slate-300 hover:border-sky-400'

  return (
    <div className="relative h-12 w-12" title={modelName}>
      <Handle type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 bg-white shadow-sm transition group-focus-visible:ring-4 group-focus-visible:ring-sky-400 ${border} ${ring} ${
          device.powered ? 'text-slate-700' : 'text-slate-300'
        }`}
      >
        <DeviceKindIcon kind={device.kind} className="h-7 w-7" aria-hidden="true" />
      </span>
      <span
        className={`absolute end-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
          device.powered ? 'bg-emerald-500' : 'bg-slate-400'
        }`}
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute start-1/2 top-full mt-1 w-32 -translate-x-1/2 text-center leading-tight rtl:translate-x-1/2">
        <span className="rounded bg-white/90 px-1 text-xs font-medium text-slate-700">{device.name}</span>
      </span>
    </div>
  )
}

export default memo(WorkspaceDeviceNode)
