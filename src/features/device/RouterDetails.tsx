import { useTranslation } from 'react-i18next'
import type { Device } from '../../domain/NetworkTypes'

interface RouterDetailsProps {
  device: Device
}

/** Read-only view of a router's LAN interfaces, DHCP pools, WAN and DNS forwarding. */
function RouterDetails({ device }: RouterDetailsProps) {
  const { t } = useTranslation('device')
  const interfaces = device.routerInterfaces ?? []
  const pools = device.dhcpPools ?? []

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-slate-500">{t('router.readOnly')}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">{t('router.wan')}</dt>
        <dd>{device.wanUp ? t('router.wanUp') : t('router.wanDown')}</dd>
        <dt className="text-slate-500">{t('router.dnsForwarding')}</dt>
        <dd>{device.dnsForwarding ? t('router.enabled') : t('router.disabled')}</dd>
      </dl>
      <section>
        <h4 className="mb-1 font-medium text-slate-700">{t('router.lanInterfaces')}</h4>
        <table className="w-full text-start">
          <thead className="text-xs text-slate-500">
            <tr>
              <th scope="col" className="pe-2 font-medium">{t('router.interface')}</th>
              <th scope="col" className="pe-2 font-medium">{t('router.vlan')}</th>
              <th scope="col" className="pe-2 font-medium">{t('router.ipMask')}</th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map((routerInterface) => (
              <tr key={routerInterface.id} className="border-t border-slate-100">
                <th scope="row" className="py-1 pe-2 font-mono font-normal">{routerInterface.id}</th>
                <td className="py-1 pe-2">{routerInterface.vlan}</td>
                <td className="py-1 pe-2 font-mono">
                  {routerInterface.ip} / {routerInterface.mask}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h4 className="mb-1 font-medium text-slate-700">{t('router.dhcpPools')}</h4>
        {pools.length === 0 && <p className="text-slate-500">{t('router.noPools')}</p>}
        <ul className="flex flex-col gap-2">
          {pools.map((pool) => (
            <li key={pool.id} className="rounded-md border border-slate-200 p-2">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-slate-500">{t('router.vlan')}</dt>
                <dd>{pool.vlan}</dd>
                <dt className="text-slate-500">{t('router.addressRange')}</dt>
                <dd className="font-mono">{pool.rangeStart} – {pool.rangeEnd}</dd>
                <dt className="text-slate-500">{t('router.mask')}</dt>
                <dd className="font-mono">{pool.mask}</dd>
                <dt className="text-slate-500">{t('router.gateway')}</dt>
                <dd className="font-mono">{pool.gateway}</dd>
                <dt className="text-slate-500">{t('router.dns')}</dt>
                <dd className="font-mono">{pool.dns.length > 0 ? pool.dns.join(', ') : '—'}</dd>
                <dt className="text-slate-500">{t('router.leases')}</dt>
                <dd className="font-mono">
                  {pool.leases.length > 0
                    ? pool.leases.map((lease) => `${lease.ip} (${lease.mac})`).join(', ')
                    : t('router.noLeases')}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default RouterDetails
