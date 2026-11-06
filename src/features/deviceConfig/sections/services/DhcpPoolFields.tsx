import { useTranslation } from 'react-i18next'
import InputField from '../../fields/InputField'
import type { DhcpPoolDraft, DhcpPoolField } from '../../model/DhcpPoolFormModel'
import type { FieldErrors } from '../../model/formTypes'
import { fieldGrid, type ShowError } from '../sectionTypes'

interface DhcpPoolFieldsProps {
  row: DhcpPoolDraft
  errors: FieldErrors<DhcpPoolField>
  show: ShowError
  onChange: (patch: Partial<DhcpPoolDraft>) => void
}

/** One DHCP pool: name, network, optional range, default router, DNS servers, leases (read-only). */
function DhcpPoolFields({ row, errors, show, onChange }: DhcpPoolFieldsProps) {
  const { t } = useTranslation('deviceConfig')
  const leases = row.original?.leases ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className={fieldGrid}>
        <InputField label={t('dhcp.poolName')} value={row.name} onChange={(name) => onChange({ name })} error={show(errors.name)} maxLength={64} />
        <span aria-hidden="true" className="hidden @md:block" />
        <InputField label={t('dhcp.network')} type="address" value={row.network} onChange={(network) => onChange({ network })} error={show(errors.network)} />
        <InputField label={t('dhcp.mask')} type="address" value={row.mask} onChange={(mask) => onChange({ mask })} error={show(errors.mask)} />
        <InputField
          label={t('dhcp.rangeStart')}
          type="address"
          value={row.rangeStart}
          onChange={(rangeStart) => onChange({ rangeStart })}
          hint={t('dhcp.rangeHint')}
          error={show(errors.rangeStart)}
        />
        <InputField label={t('dhcp.rangeEnd')} type="address" value={row.rangeEnd} onChange={(rangeEnd) => onChange({ rangeEnd })} error={show(errors.rangeEnd)} />
        <InputField
          label={t('dhcp.defaultRouter')}
          type="address"
          value={row.defaultRouter}
          onChange={(defaultRouter) => onChange({ defaultRouter })}
          error={show(errors.defaultRouter)}
        />
        <InputField
          label={t('dhcp.dnsServers')}
          type="code"
          value={row.dnsServers}
          onChange={(dnsServers) => onChange({ dnsServers })}
          hint={t('dhcp.addressListHint')}
          error={show(errors.dnsServers)}
        />
      </div>
      {row.original && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('dhcp.leases')}</span>
          {leases.length === 0 ? (
            <p className="text-slate-500">{t('dhcp.noLeases')}</p>
          ) : (
            <ul className="flex flex-col gap-0.5 font-mono text-xs text-slate-700" dir="ltr">
              {leases.map((lease) => (
                <li key={`${lease.mac}-${lease.ip}`}>{t('dhcp.lease', { ip: lease.ip, mac: lease.mac })}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default DhcpPoolFields
