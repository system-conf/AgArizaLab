import { CircleCheck, CircleX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppLinkStatus } from '../../domain'
import { useMessageTranslator } from '../../i18n'
import { failureReasonMessage } from './failureReasonMessages'

interface AppLinkStatusListProps {
  statuses: AppLinkStatus[]
}

/** Green / red status of each application link of a device. */
function AppLinkStatusList({ statuses }: AppLinkStatusListProps) {
  const { t } = useTranslation('device')
  const translateMessage = useMessageTranslator()
  // A failed status without a reason should not happen; it shows the most generic symptom.
  const problemText = (status: AppLinkStatus): string =>
    translateMessage(failureReasonMessage(status.reason ?? 'noRouteToDestination'))

  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {statuses.map((status) => (
        <li
          key={status.appLinkId}
          className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
            status.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
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
            <span className="block text-xs">{status.ok ? t('appLinks.ok') : problemText(status)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export default AppLinkStatusList
