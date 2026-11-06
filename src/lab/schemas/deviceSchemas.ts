// zod mirror of src/domain/DeviceTypes.ts (see portSchemas.ts for the conventions).
import { z } from 'zod'
import type { DeviceKind } from '../../domain'
import { idSchema, l3SettingsSchema, portSchema, reservedKey, vlanIdSchema } from './portSchemas'
import { deviceServicesSchema, internetSettingsSchema } from './serviceSchemas'

/** Every DeviceKind (the type-equality test fails when the domain union gains a member). */
export const DEVICE_KINDS = [
  'internet',
  'router',
  'wirelessRouter',
  'switch',
  'l3Switch',
  'hub',
  'accessPoint',
  'pc',
  'laptop',
  'server',
  'printer',
  'ipPhone',
  'pos',
  'camera',
  'nvr',
  'kitchenDisplay',
  'smartphone',
  'tablet',
] as const satisfies readonly DeviceKind[]

export const deviceKindSchema = z.enum(DEVICE_KINDS)

export const appLinkSchema = z.strictObject({
  id: idSchema,
  label: z.string(),
  targetIp: z.string(),
  targetKind: deviceKindSchema,
})

export const hostSettingsSchema = z.strictObject({
  defaultGateway: z.string(),
  dnsServers: z.array(z.string()),
  appLinks: z.array(appLinkSchema),
})

export const vlanEntrySchema = z.strictObject({ id: vlanIdSchema, name: z.string() })

export const sviSchema = z.strictObject({
  vlan: vlanIdSchema,
  adminUp: z.boolean(),
  description: z.string().optional(),
  l3: l3SettingsSchema,
})

export const switchingFeaturesSchema = z.strictObject({
  stp: reservedKey,
  vtp: reservedKey,
  dhcpSnooping: reservedKey,
  arpInspection: reservedKey,
})

export const switchingSettingsSchema = z.strictObject({
  vlans: z.array(vlanEntrySchema),
  svis: z.array(sviSchema),
  defaultGateway: z.string(),
  features: switchingFeaturesSchema.optional(),
})

const staticRouteBaseShape = {
  prefix: z.string(),
  mask: z.string(),
  adminDistance: z.number().int().min(0).max(255),
}

export const staticRouteSchema = z.union([
  z.strictObject({ ...staticRouteBaseShape, nextHop: z.string(), exitInterfaceId: z.string().optional() }),
  z.strictObject({ ...staticRouteBaseShape, nextHop: reservedKey, exitInterfaceId: z.string() }),
])

export const routingFeaturesSchema = z.strictObject({
  rip: reservedKey,
  ospf: reservedKey,
  eigrp: reservedKey,
  bgp: reservedKey,
})

export const routingSettingsSchema = z.strictObject({
  ipRouting: z.boolean(),
  staticRoutes: z.array(staticRouteSchema),
  features: routingFeaturesSchema.optional(),
})

export const wirelessSecuritySchema = z.strictObject({ mode: z.literal('open') })

export const ssidSettingsSchema = z.strictObject({
  ssid: z.string(),
  vlan: vlanIdSchema,
  security: wirelessSecuritySchema,
})

export const wirelessSettingsSchema = z.strictObject({
  ssids: z.array(ssidSettingsSchema),
  radio: reservedKey,
})

export const deviceFeaturesSchema = z.strictObject({
  management: reservedKey,
  accessLists: reservedKey,
  nat: reservedKey,
  discovery: reservedKey,
  monitoring: reservedKey,
})

export const deviceSchema = z.strictObject({
  id: idSchema,
  kind: deviceKindSchema,
  modelId: idSchema,
  name: z.string(),
  powered: z.boolean(),
  baseMac: z.string(),
  ports: z.array(portSchema),
  host: hostSettingsSchema.optional(),
  switching: switchingSettingsSchema.optional(),
  routing: routingSettingsSchema.optional(),
  wireless: wirelessSettingsSchema.optional(),
  services: deviceServicesSchema.optional(),
  internet: internetSettingsSchema.optional(),
  features: deviceFeaturesSchema.optional(),
})
