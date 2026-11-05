// zod mirror of src/domain/v2/ServiceTypes.ts (see portSchemas.ts for the conventions).
import { z } from 'zod'
import { idSchema, reservedKey } from './portSchemas'

export const addressRangeSchema = z.strictObject({ start: z.string(), end: z.string() })

export const dhcpLeaseSchema = z.strictObject({ mac: z.string(), ip: z.string() })

export const dhcpPoolSchema = z.strictObject({
  id: idSchema,
  network: z.string(),
  mask: z.string(),
  range: addressRangeSchema.optional(),
  defaultRouter: z.string(),
  dnsServers: z.array(z.string()),
  leases: z.array(dhcpLeaseSchema),
})

export const dhcpServerSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  pools: z.array(dhcpPoolSchema),
  excludedRanges: z.array(addressRangeSchema),
})

export const dnsRecordSchema = z.strictObject({
  type: z.literal('A'),
  name: z.string(),
  address: z.string(),
})

export const dnsServerSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  forwarders: z.array(z.string()),
  records: z.array(dnsRecordSchema),
})

export const deviceServicesSchema = z.strictObject({
  dhcp: dhcpServerSettingsSchema.optional(),
  dns: dnsServerSettingsSchema.optional(),
  http: reservedKey,
  ftp: reservedKey,
  tftp: reservedKey,
  email: reservedKey,
  syslog: reservedKey,
  ntp: reservedKey,
  aaa: reservedKey,
})

export const ispHandoffSchema = z.strictObject({
  portId: idSchema,
  serviceUp: z.boolean(),
  customerAddressing: reservedKey,
})

export const internetSettingsSchema = z.strictObject({ handoffs: z.array(ispHandoffSchema) })
