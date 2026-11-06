// DHCP server of a device: service switch, pools (`ip dhcp pool`) and device-wide excluded
// address ranges (`ip dhcp excluded-address`). Leases are shown, never edited.
import type { AddressRange, DhcpPoolV2, DhcpServerSettings } from '../../../domain/v2'
import { localizedMessage } from '../../../i18n/messageKeys'
import { AddressListParser } from './AddressListParser'
import { newRowKey, type FieldErrors } from './formTypes'
import { Ipv4Fields } from './Ipv4Fields'

export interface DhcpPoolDraft {
  key: string
  /** Keeps the leases of an existing pool. */
  original?: DhcpPoolV2
  name: string
  network: string
  mask: string
  rangeStart: string
  rangeEnd: string
  defaultRouter: string
  dnsServers: string
}

export interface ExcludedRangeDraft {
  key: string
  start: string
  /** '' = a single address. */
  end: string
}

export interface DhcpDraft {
  enabled: boolean
  pools: DhcpPoolDraft[]
  excluded: ExcludedRangeDraft[]
}

export type DhcpPoolField = 'name' | 'network' | 'mask' | 'rangeStart' | 'rangeEnd' | 'defaultRouter' | 'dnsServers'
export type ExcludedRangeField = 'start' | 'end'

export interface DhcpErrors {
  pools: FieldErrors<DhcpPoolField>[]
  excluded: FieldErrors<ExcludedRangeField>[]
}

const EMPTY_SERVER: DhcpServerSettings = { enabled: false, pools: [], excludedRanges: [] }

export class DhcpPoolFormModel {
  /** A device without a DHCP server yet gets an empty, disabled one. */
  static toDraft(settings: DhcpServerSettings | undefined): DhcpDraft {
    const server = settings ?? EMPTY_SERVER
    return {
      enabled: server.enabled,
      pools: server.pools.map((pool) => ({
        key: `pool${pool.id}`,
        original: pool,
        name: pool.id,
        network: pool.network,
        mask: pool.mask,
        rangeStart: pool.range?.start ?? '',
        rangeEnd: pool.range?.end ?? '',
        defaultRouter: pool.defaultRouter,
        dnsServers: AddressListParser.format(pool.dnsServers),
      })),
      excluded: server.excludedRanges.map((range, index) => ({
        key: `excluded${index}`,
        start: range.start,
        end: range.end === range.start ? '' : range.end,
      })),
    }
  }

  static newPool(existing: readonly DhcpPoolDraft[]): DhcpPoolDraft {
    const names = new Set(existing.map((pool) => pool.name.trim()))
    let number = existing.length + 1
    while (names.has(`POOL${number}`)) number += 1
    return { key: newRowKey(), name: `POOL${number}`, network: '', mask: '', rangeStart: '', rangeEnd: '', defaultRouter: '', dnsServers: '' }
  }

  static newExcluded(): ExcludedRangeDraft {
    return { key: newRowKey(), start: '', end: '' }
  }

  static validate(draft: DhcpDraft): DhcpErrors {
    return { pools: DhcpPoolFormModel.validatePools(draft.pools), excluded: draft.excluded.map((row) => DhcpPoolFormModel.validateExcluded(row)) }
  }

  static isValid(errors: DhcpErrors): boolean {
    return [...errors.pools, ...errors.excluded].every((row) => Object.keys(row).length === 0)
  }

  /** Call after `validate`. */
  static apply(draft: DhcpDraft): DhcpServerSettings {
    return {
      enabled: draft.enabled,
      pools: draft.pools.map((row) => DhcpPoolFormModel.poolOf(row)),
      excludedRanges: draft.excluded.map((row): AddressRange => {
        const start = row.start.trim()
        const end = row.end.trim()
        return { start, end: end === '' ? start : end }
      }),
    }
  }

  private static validatePools(rows: readonly DhcpPoolDraft[]): FieldErrors<DhcpPoolField>[] {
    const names = new Set<string>()
    return rows.map((row) => {
      const errors: FieldErrors<DhcpPoolField> = {}
      const name = row.name.trim()
      if (name === '') errors.name = localizedMessage('deviceConfig:errors.required')
      else if (names.has(name)) errors.name = localizedMessage('deviceConfig:errors.duplicateName', { name })
      names.add(name)
      const networkError = Ipv4Fields.address(row.network, true)
      const maskError = Ipv4Fields.mask(row.mask, true)
      if (networkError) errors.network = networkError
      if (maskError) errors.mask = maskError
      if (!networkError && !maskError) {
        const notNetwork = Ipv4Fields.networkAddress(row.network, row.mask)
        if (notNetwork) errors.network = notNetwork
      }
      Object.assign(errors, DhcpPoolFormModel.rangeErrors(row.rangeStart, row.rangeEnd, false, 'rangeStart', 'rangeEnd'))
      const routerError = Ipv4Fields.address(row.defaultRouter, false)
      if (routerError) errors.defaultRouter = routerError
      const dns = AddressListParser.parse(row.dnsServers)
      if (!dns.ok) errors.dnsServers = dns.error
      return errors
    })
  }

  private static validateExcluded(row: ExcludedRangeDraft): FieldErrors<ExcludedRangeField> {
    if (row.end.trim() === '') {
      const startError = Ipv4Fields.address(row.start, true)
      return startError ? { start: startError } : {}
    }
    return DhcpPoolFormModel.rangeErrors(row.start, row.end, true, 'start', 'end')
  }

  /** Both ends or neither (unless `required`), valid, start not after end. */
  private static rangeErrors<Start extends string, End extends string>(
    startText: string,
    endText: string,
    required: boolean,
    startField: Start,
    endField: End,
  ): FieldErrors<Start | End> {
    const start = startText.trim()
    const end = endText.trim()
    const errors: FieldErrors<Start | End> = {}
    if (!required && start === '' && end === '') return errors
    if (!required && (start === '' || end === '')) {
      errors[start === '' ? startField : endField] = localizedMessage('deviceConfig:errors.rangeIncomplete')
      return errors
    }
    const startError = Ipv4Fields.address(start, true)
    const endError = Ipv4Fields.address(end, true)
    if (startError) errors[startField] = startError
    if (endError) errors[endField] = endError
    if (!startError && !endError && Ipv4Fields.compare(start, end) > 0) errors[endField] = localizedMessage('deviceConfig:errors.rangeOrder')
    return errors
  }

  private static poolOf(row: DhcpPoolDraft): DhcpPoolV2 {
    const start = row.rangeStart.trim()
    const dns = AddressListParser.parse(row.dnsServers)
    return {
      id: row.name.trim(),
      network: row.network.trim(),
      mask: row.mask.trim(),
      ...(start !== '' ? { range: { start, end: row.rangeEnd.trim() } } : {}),
      defaultRouter: row.defaultRouter.trim(),
      dnsServers: dns.ok ? dns.addresses : [],
      leases: row.original?.leases ?? [],
    }
  }
}
