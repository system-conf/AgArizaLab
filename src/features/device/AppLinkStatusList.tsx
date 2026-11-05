import { CircleCheck, CircleX } from 'lucide-react'
import type { AppLinkStatus } from '../../domain/EngineContract'

interface AppLinkStatusListProps {
  statuses: AppLinkStatus[]
}

// Deliberately vague: the player sees the symptom, not the cause.
function problemText(status: AppLinkStatus): string {
  return status.reason === 'wrongDeviceAtAddress'
    ? 'Bu adreste beklenen cihaz yok'
    : 'Ulaşılamıyor'
}

/** Green / red status of each application link of a device. */
function AppLinkStatusList({ statuses }: AppLinkStatusListProps) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {statuses.map((status) => (
        <li
          key={status.appLinkId}
          className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
            status.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
          }`}
        >
          {status.ok ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            <span className="font-medium">{status.label}</span>{' '}
            <span className="font-mono text-xs">({status.targetIp})</span>
            <span className="block text-xs">{status.ok ? 'Bağlantı var' : problemText(status)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export default AppLinkStatusList
