// zod mirror of the v1 shapes (src/domain/NetworkTypes.ts, ScenarioTypes.ts) so that a v1 network
// or exercise file can be checked before src/lab/migrations upgrades it. MACs are checked here
// because the migration derives port MACs from them.
import { z } from 'zod'
import { idSchema } from './portSchemas'

const MAC_PATTERN = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/

const v1DeviceKindSchema = z.enum([
  'internet',
  'router',
  'switch',
  'accessPoint',
  'pc',
  'pos',
  'printer',
  'camera',
  'nvr',
  'kitchenDisplay',
  'phone',
])

const v1HostSchema = z.object({
  mode: z.enum(['static', 'dhcp']),
  ip: z.string(),
  mask: z.string(),
  gateway: z.string(),
  dns: z.array(z.string()),
})

const v1SwitchPortSchema = z.object({
  id: idSchema,
  vlan: z.number().int(),
  mode: z.enum(['access', 'trunk']),
  enabled: z.boolean(),
  poe: z.boolean(),
})

const v1RouterInterfaceSchema = z.object({ id: idSchema, vlan: z.number().int(), ip: z.string(), mask: z.string() })

const v1DhcpPoolSchema = z.object({
  id: idSchema,
  vlan: z.number().int(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
  mask: z.string(),
  gateway: z.string(),
  dns: z.array(z.string()),
  leases: z.array(z.object({ mac: z.string(), ip: z.string() })),
})

const v1AppLinkSchema = z.object({
  id: idSchema,
  label: z.string(),
  targetIp: z.string(),
  targetKind: v1DeviceKindSchema,
})

export const v1DeviceSchema = z.object({
  id: idSchema,
  kind: v1DeviceKindSchema,
  name: z.string(),
  mac: z.string().regex(MAC_PATTERN),
  position: z.object({ x: z.number(), y: z.number() }),
  powered: z.boolean(),
  host: v1HostSchema.optional(),
  switchPorts: z.array(v1SwitchPortSchema).optional(),
  routerInterfaces: z.array(v1RouterInterfaceSchema).optional(),
  dhcpPools: z.array(v1DhcpPoolSchema).optional(),
  wanUp: z.boolean().optional(),
  dnsForwarding: z.boolean().optional(),
  wirelessNetworks: z.array(z.object({ ssid: z.string(), vlan: z.number().int() })).optional(),
  appLinks: z.array(v1AppLinkSchema).optional(),
})

const v1LinkEndSchema = z.object({ deviceId: idSchema, portId: idSchema })

export const v1NetworkStateSchema = z.object({
  devices: z.array(v1DeviceSchema),
  links: z.array(
    z.object({
      id: idSchema,
      a: v1LinkEndSchema,
      b: v1LinkEndSchema,
      connected: z.boolean(),
      ssid: z.string().optional(),
    }),
  ),
})

const v1SolveConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('internet'), fromDeviceId: idSchema }),
  z.object({ type: z.literal('resolves'), fromDeviceId: idSchema, name: z.string() }),
  z.object({ type: z.literal('reachable'), fromDeviceId: idSchema, toDeviceId: idSchema }),
  z.object({ type: z.literal('appLinksOk'), deviceId: idSchema }),
])

export const v1ScenarioDefinitionSchema = z.object({
  id: idSchema,
  order: z.number(),
  setting: z.enum(['restoran', 'ofis', 'magaza']),
  initialState: v1NetworkStateSchema,
  solvedWhen: z.array(v1SolveConditionSchema),
})
