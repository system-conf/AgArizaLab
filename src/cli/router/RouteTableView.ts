// `show ip route` (docs/CLI.md §7), IOS 15.1 layout as Packet Tracer prints it: the codes legend, the
// gateway of last resort, then the routes grouped under their classful network. Source: the simulator's
// routing table (env.runtime); static routes that do not resolve (exitInterfaceId null) are hidden.
import type { Device, StaticRoute } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { RouteEntry } from '../../sim/contract'
import { InterfaceNames } from '../core/InterfaceNames'

const CODES = [
  'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
  '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
  '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
  '       E1 - OSPF external type 1, E2 - OSPF external type 2, E - EGP',
  '       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area',
  '       * - candidate default, U - per-user static route, o - ODR',
  '       P - periodic downloaded static route',
]

const CODE_LETTERS: Readonly<Record<RouteEntry['code'], string>> = { connected: 'C', local: 'L', static: 'S' }
const DEFAULT_PREFIX = '0.0.0.0'

interface ShownRoute {
  readonly entry: RouteEntry
  readonly value: number
  readonly exitInterfaceId: string
}

type RoutePart =
  | { readonly kind: 'single'; readonly route: ShownRoute }
  | { readonly kind: 'group'; readonly major: number; readonly length: number; readonly routes: readonly ShownRoute[] }

/** Prefix length of the classful network an address belongs to (A /8, B /16, C /24, D/E /32). */
function classfulLength(value: number): number {
  const first = Math.floor(value / 2 ** 24)
  if (first < 128) return 8
  if (first < 192) return 16
  if (first < 224) return 24
  return 32
}

function maskValue(prefixLength: number): number {
  return Ipv4.prefixToMask(prefixLength) >>> 0
}

/** Installed routes, the best administrative distance per prefix, in address order. */
function shownRoutes(routes: readonly RouteEntry[]): ShownRoute[] {
  const installed: ShownRoute[] = []
  for (const entry of routes) {
    const value = Ipv4.parse(entry.prefix)
    if (entry.exitInterfaceId === null || value === null) continue
    installed.push({ entry, value, exitInterfaceId: entry.exitInterfaceId })
  }
  const best = new Map<string, number>()
  for (const { entry } of installed) {
    const key = `${entry.prefix}/${entry.prefixLength}`
    best.set(key, Math.min(best.get(key) ?? Number.POSITIVE_INFINITY, entry.adminDistance))
  }
  return installed
    .filter(({ entry }) => best.get(`${entry.prefix}/${entry.prefixLength}`) === entry.adminDistance)
    .sort((a, b) => a.value - b.value || a.entry.prefixLength - b.entry.prefixLength)
}

/** The configured static route behind an entry (to print the exit interface it was configured with). */
function configuredRoute(device: Device, entry: RouteEntry): StaticRoute | undefined {
  return device.routing?.staticRoutes.find(
    (route) => route.prefix === entry.prefix && route.mask === entry.mask && route.adminDistance === entry.adminDistance && (route.nextHop ?? null) === entry.nextHop,
  )
}

export class RouteTableView {
  static lines(device: Device, routes: readonly RouteEntry[]): string[] {
    const shown = shownRoutes(routes)
    const lines = [...CODES, '', RouteTableView.gateway(shown), '']
    for (const part of RouteTableView.groups(shown)) {
      if (part.kind === 'single') lines.push(RouteTableView.routeLine(device, part.route, 5))
      else lines.push(RouteTableView.header(part.major, part.length, part.routes), ...part.routes.map((route) => RouteTableView.routeLine(device, route, 8)))
    }
    return lines
  }

  /**
   * IOS grouping: routes inside a classful network that has subnets are listed under a header line;
   * supernets (the default route) and classful networks without subnets stand alone.
   */
  private static groups(shown: readonly ShownRoute[]): RoutePart[] {
    const parts: RoutePart[] = []
    let index = 0
    while (index < shown.length) {
      const first = shown[index]
      if (first === undefined) break
      const length = classfulLength(first.value)
      if (first.entry.prefixLength < length) {
        parts.push({ kind: 'single', route: first })
        index += 1
        continue
      }
      const major = (first.value & maskValue(length)) >>> 0
      const routes: ShownRoute[] = []
      for (let next = shown[index]; next !== undefined && next.entry.prefixLength >= length && ((next.value & maskValue(length)) >>> 0) === major; next = shown[index]) {
        routes.push(next)
        index += 1
      }
      if (routes.every((route) => route.entry.prefixLength === length)) parts.push(...routes.map((route): RoutePart => ({ kind: 'single', route })))
      else parts.push({ kind: 'group', major, length, routes })
    }
    return parts
  }

  private static gateway(shown: readonly ShownRoute[]): string {
    const fallback = shown.find(({ entry }) => entry.prefix === DEFAULT_PREFIX && entry.prefixLength === 0)
    if (fallback === undefined) return 'Gateway of last resort is not set'
    return `Gateway of last resort is ${fallback.entry.nextHop ?? DEFAULT_PREFIX} to network ${DEFAULT_PREFIX}`
  }

  /** '     10.0.0.0/24 is subnetted, 2 subnets' or '… is variably subnetted, 2 subnets, 2 masks'. */
  private static header(major: number, length: number, group: readonly ShownRoute[]): string {
    const masks = new Set(group.map(({ entry }) => entry.prefixLength))
    const network = Ipv4.format(major)
    const [onlyMask] = masks
    if (masks.size === 1 && onlyMask !== undefined) return `     ${network}/${onlyMask} is subnetted, ${group.length} subnets`
    return `     ${network}/${length} is variably subnetted, ${group.length} subnets, ${masks.size} masks`
  }

  private static routeLine(device: Device, route: ShownRoute, codeWidth: number): string {
    const { entry } = route
    const candidate = entry.prefixLength === 0 ? '*' : ''
    const code = `${CODE_LETTERS[entry.code]}${candidate}`.padEnd(codeWidth)
    const target = `${entry.prefix}/${entry.prefixLength}`
    const exitName = InterfaceNames.longName(route.exitInterfaceId)
    if (entry.nextHop === null) return `${code}${target} is directly connected, ${exitName}`
    const configured = entry.code === 'static' ? configuredRoute(device, entry) : undefined
    const via = configured?.exitInterfaceId === undefined ? '' : `, ${exitName}`
    return `${code}${target} [${entry.adminDistance}/${entry.metric}] via ${entry.nextHop}${via}`
  }

  /** `show ip route` of a device that does not route (L2 switch, L3 switch without `ip routing`). */
  static notRouting(defaultGateway: string): string[] {
    return [
      defaultGateway === '' ? 'Default gateway is not set' : `Default gateway is ${defaultGateway}`,
      '',
      'Host               Gateway           Last Use    Total Uses  Interface',
      'ICMP redirect cache is empty',
    ]
  }
}
