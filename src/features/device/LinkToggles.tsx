import { Plug, Unplug } from 'lucide-react'
import type { Link, NetworkState } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'
import { linksOfDevice } from './deviceLinks'

interface LinkTogglesProps {
  deviceId: string
  state: NetworkState
  onUpdateLink: (next: Link) => void
}

/** Plug / unplug buttons for every cable (or wireless association) of a device. */
function LinkToggles({ deviceId, state, onUpdateLink }: LinkTogglesProps) {
  const views = linksOfDevice(state, deviceId)
  if (views.length === 0) {
    return <p className="text-sm text-slate-500">Bu cihaza bağlı kablo yok.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {views.map(({ link, ownPortId, peer, peerPortId }) => {
        const wireless = link.ssid !== undefined
        const peerName = peer?.name ?? 'Bilinmeyen cihaz'
        const actionText = wireless
          ? link.connected ? 'Bağlantıyı kes' : 'Bağlan'
          : link.connected ? 'Kabloyu çıkar' : 'Kabloyu tak'
        return (
          <li key={link.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-sm">
            <span>
              <span className="font-mono">{ownPortId}</span> → {peerName}{' '}
              <span className="font-mono text-slate-500">({peerPortId})</span>
              {wireless && <span className="block text-xs text-slate-500">Kablosuz ağ: {link.ssid}</span>}
            </span>
            <button
              type="button"
              onClick={() => onUpdateLink({ ...link, connected: !link.connected })}
              className={`flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 ${focusRing}`}
            >
              {link.connected ? <Unplug className="h-4 w-4" aria-hidden="true" /> : <Plug className="h-4 w-4" aria-hidden="true" />}
              {actionText}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default LinkToggles
