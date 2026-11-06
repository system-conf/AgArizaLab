// DHCP server commands (docs/CLI.md §8, C3): `ip dhcp pool` (+ the dhcp-config mode), `ip dhcp
// excluded-address`, `service dhcp`. Model: Device.services.dhcp (MODEL_V2 §4).
import type { DhcpPool } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { AddressList } from './AddressList'
import { RouterEdits } from './RouterEdits'

const MAX_DNS_SERVERS = 8
const POOL_NAME_PATTERN = /^\S{1,64}$/

/** Classful mask of an address (`network 10.0.0.0` without a mask). */
export function classfulMask(address: string): string {
  const first = Math.floor((Ipv4.parse(address) ?? 0) / 2 ** 24)
  if (first < 128) return '255.0.0.0'
  if (first < 192) return '255.255.0.0'
  return '255.255.255.0'
}

function enterPool(ctx: CliContext): CliCommandResult {
  const poolId = ctx.args.text('pool')
  if (!POOL_NAME_PATTERN.test(poolId)) return { lines: cliError('% Invalid pool name') }
  return { device: RouterEdits.updatePool(ctx.device, poolId, (pool) => pool), mode: { kind: 'dhcpPool', poolId } }
}

function removePool(ctx: CliContext): CliCommandResult {
  const poolId = ctx.args.text('pool')
  if (!RouterEdits.dhcpOf(ctx.device).pools.some((pool) => pool.id === poolId)) return { lines: cliError(`%DHCP pool ${poolId} does not exist.`) }
  return { device: RouterEdits.updateDhcp(ctx.device, (dhcp) => ({ ...dhcp, pools: dhcp.pools.filter((pool) => pool.id !== poolId) })) }
}

function excludedRange(ctx: CliContext): { readonly start: string; readonly end: string } | null {
  const start = ctx.args.text('low')
  const end = ctx.args.has('high') ? ctx.args.text('high') : start
  const low = Ipv4.parse(start)
  const high = Ipv4.parse(end)
  return low !== null && high !== null && low <= high ? { start, end } : null
}

function exclude(ctx: CliContext): CliCommandResult {
  const range = excludedRange(ctx)
  if (range === null) return { lines: cliError('% Invalid address range') }
  const device = RouterEdits.updateDhcp(ctx.device, (dhcp) => {
    const known = dhcp.excludedRanges.some((entry) => entry.start === range.start && entry.end === range.end)
    return known ? dhcp : { ...dhcp, excludedRanges: [...dhcp.excludedRanges, range] }
  })
  return { device }
}

function removeExcluded(ctx: CliContext): CliCommandResult {
  const range = excludedRange(ctx)
  const known = range !== null && RouterEdits.dhcpOf(ctx.device).excludedRanges.some((entry) => entry.start === range.start && entry.end === range.end)
  if (range === null || !known) {
    const low = ctx.args.text('low')
    return { lines: cliError(`% Range [${low}, ${ctx.args.has('high') ? ctx.args.text('high') : low}] is not in the database.`) }
  }
  const device = RouterEdits.updateDhcp(ctx.device, (dhcp) => ({
    ...dhcp,
    excludedRanges: dhcp.excludedRanges.filter((entry) => entry.start !== range.start || entry.end !== range.end),
  }))
  return { device }
}

function setService(ctx: CliContext, enabled: boolean): CliCommandResult {
  return { device: RouterEdits.updateDhcp(ctx.device, (dhcp) => ({ ...dhcp, enabled })) }
}

function updatePool(ctx: CliContext, change: (pool: DhcpPool) => DhcpPool): CliCommandResult {
  return { device: RouterEdits.updatePool(ctx.device, RouterEdits.poolId(ctx), change) }
}

/** `network <address> [<mask>]`: stored as the network address (host bits cleared). */
function setNetwork(ctx: CliContext): CliCommandResult {
  const address = ctx.args.text('network')
  const mask = ctx.args.has('mask') ? ctx.args.text('mask') : classfulMask(address)
  const network = Ipv4.network(address, mask)
  if (network === null) return { lines: cliError('% Invalid mask') }
  return updatePool(ctx, (pool) => ({ ...pool, network: Ipv4.format(network), mask }))
}

const poolCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['dhcpPool'],
    node: keyword('network', 'Network number and mask', {
      runNo: (ctx) => updatePool(ctx, (pool) => ({ ...pool, network: '', mask: '' })),
      children: [
        param('network', { type: 'ipv4' }, 'Network number in dotted-decimal notation', {
          run: setNetwork,
          children: [param('mask', { type: 'ipv4' }, 'Network mask or prefix length', { run: setNetwork })],
        }),
      ],
    }),
  },
  {
    modes: ['dhcpPool'],
    node: keyword('default-router', 'Default routers', {
      runNo: (ctx) => updatePool(ctx, (pool) => ({ ...pool, defaultRouter: '' })),
      children: [
        param('router', { type: 'ipv4' }, 'Router\'s IP address', {
          run: (ctx) => updatePool(ctx, (pool) => ({ ...pool, defaultRouter: ctx.args.text('router') })),
          runNo: (ctx) => updatePool(ctx, (pool) => ({ ...pool, defaultRouter: '' })),
        }),
      ],
    }),
  },
  {
    modes: ['dhcpPool'],
    node: keyword('dns-server', 'DNS servers', {
      runNo: (ctx) => updatePool(ctx, (pool) => ({ ...pool, dnsServers: [] })),
      children: [
        AddressList.chain('server', MAX_DNS_SERVERS, "Server's IP address", {
          run: (ctx) => updatePool(ctx, (pool) => ({ ...pool, dnsServers: AddressList.values(ctx, 'server', MAX_DNS_SERVERS) })),
          runNo: (ctx) => updatePool(ctx, (pool) => ({ ...pool, dnsServers: [] })),
        }),
      ],
    }),
  },
  {
    // Accepted so IOS lab configs run; the lab model has no lease time yet (leases last the lab's 1 day).
    modes: ['dhcpPool'],
    node: keyword('lease', 'Address lease time', {
      runNo: () => ({}),
      children: [
        keyword('infinite', 'Infinite lease', { run: () => ({}) }),
        param('days', { type: 'number', min: 0, max: 365 }, 'Days', {
          run: () => ({}),
          children: [
            param('hours', { type: 'number', min: 0, max: 23 }, 'Hours', {
              run: () => ({}),
              children: [param('minutes', { type: 'number', min: 0, max: 59 }, 'Minutes', { run: () => ({}) })],
            }),
          ],
        }),
      ],
    }),
  },
]

export const dhcpCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('ip', 'Global IP configuration subcommands', {
      children: [
        keyword('dhcp', 'Configure DHCP server and relay parameters', {
          when: CliWhens.routing,
          children: [
            keyword('pool', 'Configure DHCP address pools', {
              children: [param('pool', { type: 'word' }, 'Pool name', { run: enterPool, runNo: removePool })],
            }),
            keyword('excluded-address', 'Prevent DHCP from assigning certain addresses', {
              children: [
                param('low', { type: 'ipv4' }, 'Low IP address', {
                  run: exclude,
                  runNo: removeExcluded,
                  children: [param('high', { type: 'ipv4' }, 'High IP address', { run: exclude, runNo: removeExcluded })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
  {
    modes: ['globalConfig'],
    node: keyword('service', 'Modify use of network based services', {
      children: [
        keyword('dhcp', 'Enable DHCP server and relay agent', {
          when: CliWhens.routing,
          run: (ctx) => setService(ctx, true),
          runNo: (ctx) => setService(ctx, false),
        }),
      ],
    }),
  },
  ...poolCommands,
]
