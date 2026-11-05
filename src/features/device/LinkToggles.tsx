import type { TFunction } from 'i18next'
import { Plug, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Link, NetworkState } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'
import { linksOfDevice } from './deviceLinks'

interface LinkTogglesProps {
  deviceId: string
  state: NetworkState
  onUpdateLink: (next: Link) => void
}

/** Button text: wireless links connect / disconnect, cables are plugged in / unplugged. */
function actionText(t: TFunction<'device'>, link: Link): string {
  if (link.ssid !== undefined) return link.connected ? t('links.disconnect') : t('links.connect')
  return link.connected ? t('links.unplug') : t('links.plugIn')
}

/** Plug / unplug buttons for every cable (or wireless association) of a device. */
function LinkToggles({ deviceId, state, onUpdateLink }: LinkTogglesProps) {
  const { t } = useTranslation('device')
  const views = linksOfDevice(state, deviceId)
  if (views.length === 0) {
    return <p className="text-sm text-slate-500">{t('links.noneOnDevice')}</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {views.map(({ link, ownPortId, peer, peerPortId }) => (
        <li key={link.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-sm">
          <span>
            <span className="font-mono">{ownPortId}</span> → {peer?.name ?? t('links.unknownDevice')}{' '}
            <span className="font-mono text-slate-500">({peerPortId})</span>
            {link.ssid !== undefined && (
              <span className="block text-xs text-slate-500">{t('links.wirelessNetwork', { ssid: link.ssid })}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onUpdateLink({ ...link, connected: !link.connected })}
            className={`flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 ${focusRing}`}
          >
            {link.connected ? <Unplug className="h-4 w-4" aria-hidden="true" /> : <Plug className="h-4 w-4" aria-hidden="true" />}
            {actionText(t, link)}
          </button>
        </li>
      ))}
    </ul>
  )
}

export default LinkToggles
