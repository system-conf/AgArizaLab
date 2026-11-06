// zod mirror of src/domain/ServiceTypes.ts (see portSchemas.ts for the conventions).
import { z } from 'zod'
import { idSchema, listOf, nameSchema, reservedKey } from './portSchemas'

export const addressRangeSchema = z.strictObject({ start: nameSchema, end: nameSchema })

export const dhcpLeaseSchema = z.strictObject({ mac: nameSchema, ip: nameSchema })

export const dhcpPoolSchema = z.strictObject({
  id: idSchema,
  network: nameSchema,
  mask: nameSchema,
  range: addressRangeSchema.optional(),
  defaultRouter: nameSchema,
  dnsServers: listOf(nameSchema),
  leases: listOf(dhcpLeaseSchema),
})

export const dhcpServerSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  pools: listOf(dhcpPoolSchema),
  excludedRanges: listOf(addressRangeSchema),
})

export const dnsRecordSchema = z.strictObject({
  type: z.literal('A'),
  name: nameSchema,
  address: nameSchema,
})

export const dnsServerSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  forwarders: listOf(nameSchema),
  records: listOf(dnsRecordSchema),
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

export const internetSettingsSchema = z.strictObject({ handoffs: listOf(ispHandoffSchema) })
