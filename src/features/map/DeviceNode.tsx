import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { deviceIcons } from './deviceIcons'
import type { DeviceFlowNode } from './mapTypes'

/** Invisible, centred handles: links run from icon centre to icon centre. */
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

/**
 * A device on the map. The node box is just the icon (so the node position is the icon centre);
 * name and IP hang below it. Power dot: green on, grey off.
 */
function DeviceNode({ data, selected }: NodeProps<DeviceFlowNode>) {
  const { t } = useTranslation('map')
  const { device, ipLabel } = data
  const Icon = deviceIcons[device.kind]

  return (
    <div className="relative h-12 w-12 cursor-pointer">
      <Handle type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full border-2 bg-white shadow-sm transition group-focus-visible:ring-4 group-focus-visible:ring-sky-400 ${
          selected ? 'border-sky-600 ring-4 ring-sky-200' : 'border-slate-300 hover:border-sky-400'
        } ${device.powered ? 'text-slate-700' : 'text-slate-300'}`}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span
        className={`absolute end-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
          device.powered ? 'bg-emerald-500' : 'bg-slate-400'
        }`}
        title={device.powered ? t('node.poweredOn') : t('node.poweredOff')}
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute left-1/2 top-full mt-1 flex w-32 -translate-x-1/2 flex-col items-center leading-tight">
        <span
          className={`rounded bg-white/90 px-1 text-center text-xs font-medium ${
            device.powered ? 'text-slate-700' : 'text-slate-400'
          }`}
        >
          {device.name}
        </span>
        <span className="rounded bg-white/80 px-1 font-mono text-[10px] text-slate-500">{ipLabel}</span>
      </span>
    </div>
  )
}

export default memo(DeviceNode)
