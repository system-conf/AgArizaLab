import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { PortInfo, PortLight, PortSettingsSummary } from '../model/DeviceInfoModel'
import { addressText } from './addressText'

interface PortInfoListProps {
  ports: readonly PortInfo[]
}

const lightKeys = { up: 'info.linkUp', down: 'info.linkDown', noCable: 'info.noCable', unplugged: 'info.unplugged' } as const

// Like the LED on the box: green when the link is up, unlit otherwise. Settings are never coloured.
const lightClasses: Record<PortLight, string> = {
  up: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  down: 'bg-slate-50 text-slate-600 ring-slate-200',
  noCable: 'bg-slate-50 text-slate-600 ring-slate-200',
  unplugged: 'bg-slate-50 text-slate-600 ring-slate-200',
}

function settingsLines(t: TFunction<'deviceConfig'>, settings: PortSettingsSummary): string[] {
  switch (settings.kind) {
    case 'access':
      return [t('info.access', { vlan: settings.vlan })]
    case 'trunk':
      return [t('info.trunk', { native: settings.nativeVlan, allowed: settings.allowed === 'all' ? t('info.allVlans') : settings.allowed })]
    case 'l3':
      return [
        addressText(t, settings.ipv4),
        ...settings.subInterfaces.map((sub) => t('info.subInterface', { id: sub.id, vlan: sub.vlan, address: addressText(t, sub.ipv4) })),
      ]
    case 'none':
      return []
  }
}

/** Every port: medium, link light, neighbour, admin state and settings (unless hidden by a lock). */
function PortInfoList({ ports }: PortInfoListProps) {
  const { t } = useTranslation(['deviceConfig', 'catalog'])
  return (
    <ul className="flex flex-col divide-y divide-slate-100 text-sm">
      {ports.map((port) => (
        <li key={port.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono font-medium text-slate-900">{port.id}</span>
              <span className="text-xs text-slate-500">{t(`catalog:media.${port.medium}`)}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${lightClasses[port.light]}`}>{t(lightKeys[port.light])}</span>
          </div>
          {port.neighbours.map((neighbour) => (
            <span key={`${neighbour.deviceId}-${neighbour.portId}`} className="text-xs text-slate-600">
              {t('info.neighbour', { device: neighbour.deviceName, port: neighbour.portId })}
            </span>
          ))}
          {port.settings === null ? (
            <span className="text-xs italic text-slate-500">{t('info.settingsHidden')}</span>
          ) : (
            <>
              {port.adminUp === false && <span className="text-xs text-slate-700">{t('info.adminDown')}</span>}
              {settingsLines(t, port.settings).map((line) => (
                <span key={line} className="font-mono text-xs text-slate-700" dir="ltr">
                  {line}
                </span>
              ))}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

export default PortInfoList
