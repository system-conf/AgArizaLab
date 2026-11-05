import type { Device } from '../../domain/NetworkTypes'
import { deviceIcons } from '../map/deviceIcons'
import { deviceKindLabels } from './deviceKindLabels'

interface DeviceHeaderProps {
  device: Device
}

/** Top of the device panel: icon, name, kind, power state and current IP. */
function DeviceHeader({ device }: DeviceHeaderProps) {
  const Icon = deviceIcons[device.kind]
  const ip = device.host?.ip

  return (
    <div className="flex items-center gap-3">
      <span
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${
          device.powered ? 'bg-sky-50 text-sky-800 ring-sky-100' : 'bg-slate-100 text-slate-400 ring-slate-200'
        }`}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-slate-900">{device.name}</h2>
        <p className="text-xs text-slate-500">{deviceKindLabels[device.kind]}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
              device.powered ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${device.powered ? 'bg-emerald-500' : 'bg-slate-400'}`}
            />
            {device.powered ? 'Açık' : 'Kapalı'}
          </span>
          {ip !== undefined && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-slate-700">
              <span className="sr-only">IP adresi: </span>
              {ip === '' ? 'IP yok' : ip}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

export default DeviceHeader
