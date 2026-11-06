// Show commands of the router command set (docs/CLI.md §7): `show ip interface brief`, `show ip route`,
// `show arp` / `show ip arp`, `show ip dhcp binding`, `show ip dhcp pool [name]`. Runtime tables come from
// env.runtime and print empty while no simulation runs.
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliText } from '../core/CliOutput'
import { ArpTableView } from './ArpTableView'
import { DhcpViews } from './DhcpViews'
import { InterfaceBriefView } from './InterfaceBriefView'
import { RouteTableView } from './RouteTableView'
import { RouterEdits } from './RouterEdits'

function showBrief(ctx: CliContext): CliCommandResult {
  return { lines: cliText(...InterfaceBriefView.lines(ctx.env.network, ctx.device)) }
}

function showRoute(ctx: CliContext): CliCommandResult {
  const { device } = ctx
  if (device.routing?.ipRouting !== true) return { lines: cliText(...RouteTableView.notRouting(device.switching?.defaultGateway ?? '')) }
  return { lines: cliText(...RouteTableView.lines(device, ctx.env.runtime?.network.routes ?? [])) }
}

function showArp(ctx: CliContext): CliCommandResult {
  const { env } = ctx
  return { lines: cliText(...ArpTableView.lines(env.network, ctx.device, env.runtime?.link.arp ?? [], env.now)) }
}

function showBindings(ctx: CliContext): CliCommandResult {
  return { lines: cliText(...DhcpViews.bindings(ctx.env.runtime?.services.dhcpBindings ?? [])) }
}

function showPools(ctx: CliContext): CliCommandResult {
  const only = ctx.args.has('pool') ? ctx.args.text('pool') : null
  const bindings = ctx.env.runtime?.services.dhcpBindings ?? []
  return { lines: cliText(...DhcpViews.pools(RouterEdits.dhcpOf(ctx.device), bindings, only)) }
}

const arpNode = keyword('arp', 'IP ARP table', { run: showArp })

export const showCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('show', 'Show running system information', {
      children: [
        keyword('arp', 'Address Resolution Protocol (ARP)', { run: showArp }),
        keyword('ip', 'IP information', {
          children: [
            keyword('interface', 'IP interface status and configuration', {
              children: [keyword('brief', 'Brief summary of IP status and configuration', { run: showBrief })],
            }),
            keyword('route', 'IP routing table', { run: showRoute }),
            arpNode,
            keyword('dhcp', 'Show items in the DHCP database', {
              when: CliWhens.routing,
              children: [
                keyword('binding', 'DHCP address bindings', { run: showBindings }),
                keyword('pool', 'DHCP pools information', {
                  run: showPools,
                  children: [param('pool', { type: 'word' }, 'Pool name', { run: showPools })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
]
