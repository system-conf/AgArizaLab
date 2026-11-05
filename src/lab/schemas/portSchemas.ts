// zod mirror of src/domain/v2/PortTypes.ts. Reserved `never` keys accept only absence; objects are
// strict, so unknown keys are reported instead of silently dropped. labSchemas.test.ts proves at
// compile time that every inferred type equals its domain type.
import { z } from 'zod'

/** A reserved extension key (`key?: never`): must be absent until its pack gives it a type. */
export const reservedKey = z.never().optional()

/** Ids we reference (devices, ports, links, annotations): any non-empty string. */
export const idSchema = z.string().min(1)

export const portMediumSchema = z.enum(['copper', 'fiber', 'wireless', 'serial', 'console', 'coaxial'])

export const ipv4SettingsSchema = z.strictObject({
  addressing: z.enum(['static', 'dhcp']),
  address: z.string(),
  mask: z.string(),
})

export const l3FeaturesSchema = z.strictObject({
  accessGroups: reservedKey,
  natRole: reservedKey,
  ospf: reservedKey,
  rip: reservedKey,
  eigrp: reservedKey,
  hsrp: reservedKey,
})

export const l3SettingsSchema = z.strictObject({
  ipv4: ipv4SettingsSchema,
  helperAddresses: z.array(z.string()).optional(),
  ipv6: reservedKey,
  features: l3FeaturesSchema.optional(),
})

export const switchportFeaturesSchema = z.strictObject({
  portSecurity: reservedKey,
  stp: reservedKey,
  channelGroup: reservedKey,
  dhcpSnoopingTrusted: reservedKey,
  arpInspectionTrusted: reservedKey,
  voiceVlan: reservedKey,
})

/** VLAN ids are integers; the 1..4094 range is a StateInvariants check (with its own message). */
export const vlanIdSchema = z.number().int()

export const switchportSettingsSchema = z.strictObject({
  mode: z.enum(['access', 'trunk']),
  accessVlan: vlanIdSchema,
  nativeVlan: vlanIdSchema,
  allowedVlans: z.union([z.literal('all'), z.array(vlanIdSchema)]),
  features: switchportFeaturesSchema.optional(),
})

export const subInterfaceSchema = z.strictObject({
  id: idSchema,
  vlan: vlanIdSchema,
  native: z.boolean().optional(),
  adminUp: z.boolean(),
  description: z.string().optional(),
  l3: l3SettingsSchema,
})

export const serialSettingsSchema = z.strictObject({
  clockRate: z.number().int().positive().optional(),
  encapsulation: reservedKey,
})

const portCommonShape = {
  id: idSchema,
  medium: portMediumSchema,
  mac: z.string().optional(),
  adminUp: z.boolean(),
  description: z.string().optional(),
  speed: z.literal(['auto', 10, 100, 1000, 10000]).optional(),
  duplex: z.enum(['auto', 'full', 'half']).optional(),
  autoMdix: z.boolean().optional(),
  pinout: z.enum(['mdi', 'mdix']).optional(),
  poe: z.enum(['auto', 'never']).optional(),
}

export const switchedPortSchema = z.strictObject({
  ...portCommonShape,
  role: z.literal('switched'),
  l2: switchportSettingsSchema,
})

export const routedPortSchema = z.strictObject({
  ...portCommonShape,
  role: z.literal('routed'),
  l3: l3SettingsSchema,
  subInterfaces: z.array(subInterfaceSchema),
  serial: serialSettingsSchema.optional(),
})

export const hostPortSchema = z.strictObject({
  ...portCommonShape,
  role: z.literal('host'),
  l3: l3SettingsSchema,
})

export const radioPortSchema = z.strictObject({ ...portCommonShape, role: z.literal('radio') })
export const consolePortSchema = z.strictObject({ ...portCommonShape, role: z.literal('console') })
export const passivePortSchema = z.strictObject({ ...portCommonShape, role: z.literal('passive') })

export const portSchema = z.discriminatedUnion('role', [
  switchedPortSchema,
  routedPortSchema,
  hostPortSchema,
  radioPortSchema,
  consolePortSchema,
  passivePortSchema,
])
