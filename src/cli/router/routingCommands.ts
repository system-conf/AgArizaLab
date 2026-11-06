// Global routing and name resolution commands (docs/CLI.md §8, C3): `ip route`, `ip routing`,
// `ip name-server`, `ip dns server`, `ip host`. Model: Device.routing, Device.services.dns.
import type { DnsRecord, StaticRoute } from '../../domain'
import { DeviceAddresses } from '../../net/DeviceAddresses'
import { Ipv4 } from '../../net/Ipv4'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { AddressList } from './AddressList'
import { RouterEdits } from './RouterEdits'

const STATIC_DISTANCE = 1
const MAX_DISTANCE = 255
const MAX_NAME_SERVERS = 6
const HOST_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/

/** True when `prefix` has no bits outside `mask` (0.0.0.0 0.0.0.0 included). */
function isNetwork(prefix: string, mask: string): boolean {
  const prefixValue = Ipv4.parse(prefix)
  const maskValue = Ipv4.parse(mask)
  if (prefixValue === null || maskValue === null || Ipv4.prefixLength(mask) === null) return false
  return ((prefixValue & maskValue) >>> 0) === prefixValue
}

function sameRoute(a: StaticRoute, b: StaticRoute): boolean {
  return a.prefix === b.prefix && a.mask === b.mask && a.nextHop === b.nextHop && a.exitInterfaceId === b.exitInterfaceId
}

/** The route the line describes, or the IOS error. */
function parseRoute(ctx: CliContext): StaticRoute | string {
  const prefix = ctx.args.text('prefix')
  const mask = ctx.args.text('mask')
  if (!isNetwork(prefix, mask)) return '%Inconsistent address and mask'
  const adminDistance = ctx.args.has('distance') ? ctx.args.number('distance') : STATIC_DISTANCE
  const nextHop = ctx.args.has('nextHop') ? ctx.args.text('nextHop') : undefined
  if (nextHop !== undefined && DeviceAddresses.has(ctx.device, nextHop)) return "%Invalid next hop address (it's this router)"
  if (!ctx.args.has('exit')) return nextHop === undefined ? '% Incomplete command.' : { prefix, mask, adminDistance, nextHop }
  const exit = DeviceInterfaces.resolve(ctx.device, ctx.args.interface('exit'))
  if (exit === undefined || (exit.kind === 'port' && exit.port.role === 'switched')) return '%Invalid interface type and number'
  return nextHop === undefined ? { prefix, mask, adminDistance, exitInterfaceId: exit.id } : { prefix, mask, adminDistance, nextHop, exitInterfaceId: exit.id }
}

function addRoute(ctx: CliContext): CliCommandResult {
  const route = parseRoute(ctx)
  if (typeof route === 'string') return { lines: cliError(route) }
  const device = RouterEdits.updateRouting(ctx.device, (routing) => {
    const exists = routing.staticRoutes.some((candidate) => sameRoute(candidate, route))
    const staticRoutes = exists ? routing.staticRoutes.map((candidate) => (sameRoute(candidate, route) ? route : candidate)) : [...routing.staticRoutes, route]
    return { ...routing, staticRoutes }
  })
  return { device }
}

/** `no ip route <prefix> <mask> [<next hop> | <interface> …]`: every route that matches what was typed. */
function removeRoutes(ctx: CliContext): CliCommandResult {
  const prefix = ctx.args.text('prefix')
  const mask = ctx.args.text('mask')
  const nextHop = ctx.args.has('nextHop') ? ctx.args.text('nextHop') : undefined
  const exitId = ctx.args.has('exit') ? DeviceInterfaces.idOf(ctx.device, ctx.args.interface('exit')) : undefined
  const matches = (route: StaticRoute): boolean =>
    route.prefix === prefix &&
    route.mask === mask &&
    (nextHop === undefined || route.nextHop === nextHop) &&
    (exitId === undefined || route.exitInterfaceId === exitId)
  const routes = ctx.device.routing?.staticRoutes ?? []
  if (!routes.some(matches)) return { lines: cliError('%No matching route to delete') }
  return { device: RouterEdits.updateRouting(ctx.device, (routing) => ({ ...routing, staticRoutes: routing.staticRoutes.filter((route) => !matches(route)) })) }
}

function setIpRouting(ctx: CliContext, ipRouting: boolean): CliCommandResult {
  return { device: RouterEdits.updateRouting(ctx.device, (routing) => ({ ...routing, ipRouting })) }
}

function addNameServers(ctx: CliContext): CliCommandResult {
  const added = AddressList.values(ctx, 'server', MAX_NAME_SERVERS)
  const device = RouterEdits.updateDns(ctx.device, (dns) => ({
    ...dns,
    forwarders: [...dns.forwarders, ...added.filter((server) => !dns.forwarders.includes(server))].slice(0, MAX_NAME_SERVERS),
  }))
  return { device }
}

function removeNameServers(ctx: CliContext): CliCommandResult {
  const removed = AddressList.values(ctx, 'server', MAX_NAME_SERVERS)
  const device = RouterEdits.updateDns(ctx.device, (dns) => ({
    ...dns,
    forwarders: removed.length === 0 ? [] : dns.forwarders.filter((server) => !removed.includes(server)),
  }))
  return { device }
}

function setDnsServer(ctx: CliContext, enabled: boolean): CliCommandResult {
  return { device: RouterEdits.updateDns(ctx.device, (dns) => ({ ...dns, enabled })) }
}

function addHost(ctx: CliContext): CliCommandResult {
  const name = ctx.args.text('name').toLowerCase()
  if (!HOST_NAME_PATTERN.test(name) || Ipv4.isValid(name)) return { lines: cliError('% Invalid host name') }
  const record: DnsRecord = { type: 'A', name, address: ctx.args.text('address') }
  const device = RouterEdits.updateDns(ctx.device, (dns) => ({
    ...dns,
    records: dns.records.some((entry) => entry.name === name)
      ? dns.records.map((entry) => (entry.name === name ? record : entry))
      : [...dns.records, record],
  }))
  return { device }
}

function removeHost(ctx: CliContext): CliCommandResult {
  const name = ctx.args.text('name').toLowerCase()
  return { device: RouterEdits.updateDns(ctx.device, (dns) => ({ ...dns, records: dns.records.filter((entry) => entry.name !== name) })) }
}

const distanceNode = param('distance', { type: 'number', min: 1, max: MAX_DISTANCE }, 'Distance metric for this route', {
  run: addRoute,
  runNo: removeRoutes,
})

const routeNode = keyword('route', 'Establish static routes', {
  when: CliWhens.routing,
  children: [
    param('prefix', { type: 'ipv4' }, 'Destination prefix', {
      children: [
        param('mask', { type: 'ipv4' }, 'Destination prefix mask', {
          runNo: removeRoutes,
          children: [
            param('nextHop', { type: 'ipv4' }, "Forwarding router's address", { run: addRoute, runNo: removeRoutes, children: [distanceNode] }),
            param('exit', { type: 'interface' }, 'Interface', {
              run: addRoute,
              runNo: removeRoutes,
              children: [
                param('nextHop', { type: 'ipv4' }, "Forwarding router's address", { run: addRoute, runNo: removeRoutes, children: [distanceNode] }),
                distanceNode,
              ],
            }),
          ],
        }),
      ],
    }),
  ],
})

export const routingCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('ip', 'Global IP configuration subcommands', {
      children: [
        routeNode,
        keyword('routing', 'Enable IP routing', {
          when: CliWhens.routing,
          run: (ctx) => setIpRouting(ctx, true),
          runNo: (ctx) => setIpRouting(ctx, false),
        }),
        // Packet Tracer configs carry `ip classless` (always on): accepted, never written.
        keyword('classless', 'Follow classless routing forwarding rules', { hidden: true, run: () => ({}), runNo: () => ({}) }),
        keyword('name-server', 'Specify address of name server to use', {
          runNo: removeNameServers,
          children: [AddressList.chain('server', MAX_NAME_SERVERS, 'Domain server IP address (maximum of 6)', { run: addNameServers, runNo: removeNameServers })],
        }),
        keyword('dns', 'Configure DNS server for a view', {
          when: CliWhens.routing,
          children: [
            keyword('server', 'Enable DNS server', { run: (ctx) => setDnsServer(ctx, true), runNo: (ctx) => setDnsServer(ctx, false) }),
          ],
        }),
        keyword('host', 'Add an entry to the ip hostname table', {
          when: CliWhens.routing,
          children: [
            param('name', { type: 'word' }, 'Name of host', {
              runNo: removeHost,
              children: [param('address', { type: 'ipv4' }, 'Host IP address', { run: addHost, runNo: removeHost })],
            }),
          ],
        }),
      ],
    }),
  },
]
