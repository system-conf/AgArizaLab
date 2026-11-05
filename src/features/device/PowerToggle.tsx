import { Power } from 'lucide-react'
import type { Device } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'

interface PowerToggleProps {
  device: Device
  onUpdateDevice: (next: Device) => void
}

/** Turns a device on or off. */
function PowerToggle({ device, onUpdateDevice }: PowerToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={device.powered}
      onClick={() => onUpdateDevice({ ...device, powered: !device.powered })}
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
        device.powered
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      } ${focusRing}`}
    >
      <Power className="h-4 w-4" aria-hidden="true" />
      {device.powered ? 'Açık — kapatmak için tıklayın' : 'Kapalı — açmak için tıklayın'}
    </button>
  )
}

export default PowerToggle
