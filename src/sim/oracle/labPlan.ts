// Test-only (O3): the shape of a random lab as small, shrinkable data, and its fast-check arbitraries.
// LabBuilder turns a plan into a valid NetworkState (catalog models, StateInvariants clean); shrinking
// works on the plan, so a failing case shrinks to a small, readable lab.
import fc from 'fast-check'

/** How the hosts of a router's LAN are attached. */
export type LanAccess = 'switch' | 'twoSwitches' | 'hub' | 'direct' | 'l3Switch'

/** End-device models the generator uses (catalog ids). */
export const HOST_MODELS = ['pc', 'laptop', 'server', 'printer', 'ipCamera', 'pos'] as const
export type HostModel = (typeof HOST_MODELS)[number]

export type GatewayChoice = 'correct' | 'none' | 'otherHost' | 'outside' | 'missingAddress'
export type DnsChoice = 'router' | 'public' | 'server' | 'bogus' | 'otherRouter'

export interface HostPlan {
  model: HostModel
  /** 0 = first VLAN of the LAN (VLAN 10, or VLAN 1 on flat LANs), 1 = second VLAN (20). */
  vlanIndex: 0 | 1
  addressing: 'static' | 'dhcp' | 'dhcpLeased' | 'none'
  /** Last octet of a static address. */
  hostOctet: number
  gateway: GatewayChoice
  dns: DnsChoice[]
  /** AppLink to another host (index into all hosts of the lab) or to the internet. */
  appLink: null | { target: number | 'internet'; kindMatches: boolean }
  /** Servers only: run DNS (records + forwarders) / DHCP on the NIC's subnet. */
  serverDns: boolean
  serverDhcp: boolean
}

export interface SwitchPlan {
  /** VLAN 20 is missing from the database (access ports in it are inactive, trunks drop it). */
  missingVlan: boolean
  /** Trunk toward the router: native VLAN and allowed list. */
  nativeVlan: 1 | 10
  allowed: 'all' | 'firstOnly' | 'explicit'
  /** Management SVI Vlan1 with an address in the LAN's first subnet. */
  managementSvi: boolean
}

export interface LanPlan {
  access: LanAccess
  /** Two VLANs (router-on-a-stick / SVIs) instead of one flat subnet. */
  vlans: boolean
  /** Router sub-interface for VLAN 10 is `native` (takes untagged frames). */
  nativeSubInterface: boolean
  switchPlan: SwitchPlan
  /** An access point with an SSID on the first VLAN and a wireless client. */
  wireless: null | { ssidMatches: boolean; client: 'smartphone' | 'laptop' }
  hosts: HostPlan[]
  dhcp: null | { range: 'wide' | 'tiny'; exclusions: boolean; wrongRouter: boolean; relay: boolean }
  /** L3 switch LANs: `ip routing` on the L3 switch. */
  l3Routing: boolean
}

export type RouteMode = 'correct' | 'missing' | 'loop' | 'wrongNextHop' | 'floating' | 'exitInterface'

export interface RouterPlan {
  lan: LanPlan
  routes: RouteMode
  dns: null | { records: boolean; forwarders: 'public' | 'none' | 'previousRouter' }
}

export type FaultKind =
  | 'unplug'
  | 'shutdown'
  | 'powerOff'
  | 'ipConflict'
  | 'wrongGateway'
  | 'wrongMask'
  | 'serviceDown'
  | 'invalidHostAddress'
  | 'vlanChange'

export interface FaultPlan {
  kind: FaultKind
  /** Picks the device / link / port (modulo the candidates). */
  pick: number
  other: number
}

export interface LabPlan {
  internet: boolean
  routers: RouterPlan[]
  faults: FaultPlan[]
}

const hostPlan: fc.Arbitrary<HostPlan> = fc.record({
  model: fc.constantFrom(...HOST_MODELS),
  vlanIndex: fc.constantFrom<0 | 1>(0, 1),
  addressing: fc.constantFrom<HostPlan['addressing']>('static', 'static', 'static', 'dhcp', 'dhcpLeased', 'none'),
  hostOctet: fc.integer({ min: 2, max: 40 }),
  gateway: fc.constantFrom<GatewayChoice>('correct', 'correct', 'correct', 'correct', 'none', 'otherHost', 'outside', 'missingAddress'),
  dns: fc.array(fc.constantFrom<DnsChoice>('router', 'public', 'server', 'bogus', 'otherRouter'), { maxLength: 2 }),
  appLink: fc.option(
    fc.record({ target: fc.oneof(fc.nat({ max: 11 }), fc.constant<'internet'>('internet')), kindMatches: fc.boolean() }),
    { freq: 2 },
  ),
  serverDns: fc.boolean(),
  serverDhcp: fc.boolean(),
})

const switchPlan: fc.Arbitrary<SwitchPlan> = fc.record({
  missingVlan: fc.constantFrom(false, false, false, true),
  nativeVlan: fc.constantFrom<1 | 10>(1, 1, 10),
  allowed: fc.constantFrom<SwitchPlan['allowed']>('all', 'all', 'firstOnly', 'explicit'),
  managementSvi: fc.boolean(),
})

const lanPlan: fc.Arbitrary<LanPlan> = fc.record({
  access: fc.constantFrom<LanAccess>('switch', 'switch', 'switch', 'twoSwitches', 'hub', 'direct', 'l3Switch'),
  vlans: fc.boolean(),
  nativeSubInterface: fc.boolean(),
  switchPlan,
  wireless: fc.option(fc.record({ ssidMatches: fc.boolean(), client: fc.constantFrom<'smartphone' | 'laptop'>('smartphone', 'laptop') }), {
    freq: 3,
  }),
  hosts: fc.array(hostPlan, { minLength: 1, maxLength: 3 }),
  dhcp: fc.option(
    fc.record({ range: fc.constantFrom<'wide' | 'tiny'>('wide', 'wide', 'tiny'), exclusions: fc.boolean(), wrongRouter: fc.boolean(), relay: fc.boolean() }),
    { freq: 2 },
  ),
  l3Routing: fc.boolean(),
})

const routerPlan: fc.Arbitrary<RouterPlan> = fc.record({
  lan: lanPlan,
  routes: fc.constantFrom<RouteMode>('correct', 'correct', 'correct', 'missing', 'loop', 'wrongNextHop', 'floating', 'exitInterface'),
  dns: fc.option(
    fc.record({ records: fc.boolean(), forwarders: fc.constantFrom<'public' | 'none' | 'previousRouter'>('public', 'public', 'none', 'previousRouter') }),
    { freq: 2 },
  ),
})

const faultPlan: fc.Arbitrary<FaultPlan> = fc.record({
  kind: fc.constantFrom<FaultKind>(
    'unplug',
    'shutdown',
    'powerOff',
    'ipConflict',
    'wrongGateway',
    'wrongMask',
    'serviceDown',
    'invalidHostAddress',
    'vlanChange',
  ),
  pick: fc.nat({ max: 40 }),
  other: fc.nat({ max: 40 }),
})

/** A random lab plan: 1–3 routers in a chain, each with a LAN, optional internet, 0–2 faults. */
export const labPlanArbitrary: fc.Arbitrary<LabPlan> = fc.record({
  internet: fc.constantFrom(true, true, true, false),
  routers: fc.array(routerPlan, { minLength: 1, maxLength: 3 }),
  faults: fc.array(faultPlan, { maxLength: 2 }),
})
