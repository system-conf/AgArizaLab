import type { Device } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'
import { deviceIcons } from './deviceIcons'

interface DeviceNodeProps {
  device: Device
  /** Horizontal position inside the map box, 0..100. */
  leftPercent: number
  /** Vertical position inside the map box, 0..100. */
  topPercent: number
  selected: boolean
  onSelect: (deviceId: string) => void
}

/** A clickable device on the map, drawn as an HTML button above the SVG link layer. */
function DeviceNode({ device, leftPercent, topPercent, selected, onSelect }: DeviceNodeProps) {
  const Icon = deviceIcons[device.kind]
  const label = device.powered ? device.name : `${device.name} (kapalı)`

  return (
    <button
      type="button"
      onClick={() => onSelect(device.id)}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
      className={`absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-lg p-1 sm:w-24 ${focusRing}`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white shadow-sm transition sm:h-12 sm:w-12 ${
          selected ? 'border-sky-600 ring-4 ring-sky-200' : 'border-slate-300 hover:border-sky-400'
        } ${device.powered ? 'text-slate-700' : 'text-slate-300'}`}
      >
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
      </span>
      <span
        className={`rounded bg-white/90 px-1 text-center text-[10px] leading-tight sm:text-xs ${
          device.powered ? 'text-slate-700' : 'text-slate-400'
        }`}
      >
        {device.name}
      </span>
    </button>
  )
}

export default DeviceNode
