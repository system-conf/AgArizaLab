import type { Device } from '../../domain/NetworkTypes'

interface RouterDetailsProps {
  device: Device
}

/** Read-only view of a router's LAN interfaces, DHCP pools, WAN and DNS forwarding. */
function RouterDetails({ device }: RouterDetailsProps) {
  const interfaces = device.routerInterfaces ?? []
  const pools = device.dhcpPools ?? []

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-slate-500">Router ayarları bu sürümde yalnızca görüntülenebilir.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">İnternet bağlantısı (WAN)</dt>
        <dd>{device.wanUp ? 'Bağlı' : 'Bağlı değil'}</dd>
        <dt className="text-slate-500">DNS yönlendirme</dt>
        <dd>{device.dnsForwarding ? 'Açık' : 'Kapalı'}</dd>
      </dl>
      <section>
        <h4 className="mb-1 font-medium text-slate-700">LAN arayüzleri</h4>
        <table className="w-full text-left">
          <thead className="text-xs text-slate-500">
            <tr>
              <th scope="col" className="pr-2 font-medium">Arayüz</th>
              <th scope="col" className="pr-2 font-medium">VLAN</th>
              <th scope="col" className="pr-2 font-medium">IP / Maske</th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map((routerInterface) => (
              <tr key={routerInterface.id} className="border-t border-slate-100">
                <th scope="row" className="py-1 pr-2 font-mono font-normal">{routerInterface.id}</th>
                <td className="py-1 pr-2">{routerInterface.vlan}</td>
                <td className="py-1 pr-2 font-mono">
                  {routerInterface.ip} / {routerInterface.mask}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h4 className="mb-1 font-medium text-slate-700">DHCP havuzları</h4>
        {pools.length === 0 && <p className="text-slate-500">Tanımlı DHCP havuzu yok.</p>}
        <ul className="flex flex-col gap-2">
          {pools.map((pool) => (
            <li key={pool.id} className="rounded-md border border-slate-200 p-2">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-slate-500">VLAN</dt>
                <dd>{pool.vlan}</dd>
                <dt className="text-slate-500">Adres aralığı</dt>
                <dd className="font-mono">{pool.rangeStart} – {pool.rangeEnd}</dd>
                <dt className="text-slate-500">Maske</dt>
                <dd className="font-mono">{pool.mask}</dd>
                <dt className="text-slate-500">Ağ geçidi</dt>
                <dd className="font-mono">{pool.gateway}</dd>
                <dt className="text-slate-500">DNS</dt>
                <dd className="font-mono">{pool.dns.length > 0 ? pool.dns.join(', ') : '—'}</dd>
                <dt className="text-slate-500">Dağıtılan adresler</dt>
                <dd className="font-mono">
                  {pool.leases.length > 0
                    ? pool.leases.map((lease) => `${lease.ip} (${lease.mac})`).join(', ')
                    : 'Yok'}
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
