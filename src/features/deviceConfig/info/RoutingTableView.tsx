import { useTranslation } from 'react-i18next'
import type { RouteInfo } from '../model/DeviceInfoModel'

interface RoutingTableViewProps {
  routes: readonly RouteInfo[]
}

/** Connected and static routes: type, network/prefix, next hop / exit interface, distance. */
function RoutingTableView({ routes }: RoutingTableViewProps) {
  const { t } = useTranslation('deviceConfig')
  if (routes.length === 0) return <p className="text-sm text-fg-subtle">{t('info.noRoutes')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-xs">
        <thead className="text-fg-subtle">
          <tr>
            <th scope="col" className="pe-2 text-start font-medium">{t('info.routeType')}</th>
            <th scope="col" className="pe-2 text-start font-medium">{t('info.network')}</th>
            <th scope="col" className="pe-2 text-start font-medium">{t('info.via')}</th>
            <th scope="col" className="text-end font-medium">{t('info.distance')}</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route, index) => (
            <tr key={`${route.type}-${route.network}-${route.prefixLength}-${index}`} className="border-t border-border/60">
              <td className="py-1 pe-2">{t(`info.routeTypes.${route.type}`)}</td>
              <td className="py-1 pe-2 font-mono" dir="ltr">{`${route.network}/${route.prefixLength}`}</td>
              <td className="py-1 pe-2 font-mono" dir="ltr">
                {[route.nextHop, route.interfaceId].filter((part) => part !== undefined).join(', ')}
              </td>
              <td className="py-1 text-end font-mono">{route.adminDistance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default RoutingTableView
