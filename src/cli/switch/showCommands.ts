// Switch show commands (`show vlan`, `show interfaces status|trunk`, `show mac address-table`) and
// `clear mac address-table dynamic`. Tables come from the device and the simulator's runtime (docs/CLI.md §7).
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { CliWhens, keyword, param, type CliNodeOptions } from '../core/CliNodes'
import { cliError, cliText } from '../core/CliOutput'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { InterfaceReport } from './InterfaceReport'
import { MacTableReport, type MacTableFilter } from './MacTableReport'
import { VlanReport } from './VlanReport'

function showMacTable(ctx: CliContext): CliCommandResult {
  const { args } = ctx
  let portId: string | undefined
  if (args.has('interface')) {
    const found = DeviceInterfaces.resolve(ctx.device, args.interface('interface'))
    if (found === undefined) return { lines: cliError('%Invalid interface type and number') }
    portId = found.id
  }
  const type = ctx.path.includes('static') ? 'static' : ctx.path.includes('dynamic') ? 'dynamic' : undefined
  const filter: MacTableFilter = {
    ...(type === undefined ? {} : { type }),
    ...(args.has('vlan') ? { vlan: args.number('vlan') } : {}),
    ...(portId === undefined ? {} : { portId }),
    ...(args.has('mac') ? { mac: args.text('mac') } : {}),
  }
  return { lines: cliText(...MacTableReport.show(ctx.env.runtime?.link.macTable ?? [], ctx.env.now, filter)) }
}

/** Filters of `show mac address-table`; they may follow each other ('dynamic vlan 10'). */
function macTableOptions(): CliNode[] {
  const options: CliNode[] = []
  const next: CliNodeOptions = { children: options, run: showMacTable }
  options.push(
    keyword('address', 'address keyword', { children: [param('mac', { type: 'mac' }, '48 bit mac address', next)] }),
    keyword('dynamic', 'dynamic entry type', next),
    keyword('interface', 'interface keyword', { children: [param('interface', { type: 'interface' }, 'Interface', next)] }),
    keyword('static', 'static entry type', next),
    keyword('vlan', 'VLAN keyword', { children: [param('vlan', { type: 'number', min: 1, max: 4094 }, 'Vlan interface number', next)] }),
  )
  return options
}

function clearMacTable(ctx: CliContext): CliCommandResult {
  return { job: { request: { kind: 'clearTable', deviceId: ctx.device.id, table: 'mac' }, onDone: () => ({}) } }
}

const macOptions = macTableOptions()
const clearDynamic = [keyword('dynamic', 'dynamic entry type', { run: clearMacTable })]

export const showCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('show', 'Show running system information', {
      children: [
        keyword('vlan', 'VTP VLAN status', {
          when: CliWhens.switchPlatform,
          run: (ctx) => ({ lines: cliText(...VlanReport.full(ctx.device)) }),
          children: [keyword('brief', 'VTP all VLAN status in brief', { run: (ctx) => ({ lines: cliText(...VlanReport.brief(ctx.device)) }) })],
        }),
        keyword('interfaces', 'Interface status and configuration', {
          children: [
            keyword('status', 'Show interface line status', {
              when: CliWhens.switchPlatform,
              run: (ctx) => ({ lines: cliText(...new InterfaceReport(ctx.env.network, ctx.device).status()) }),
            }),
            keyword('trunk', 'Show interface trunk information', {
              when: CliWhens.switchPlatform,
              run: (ctx) => ({ lines: cliText(...new InterfaceReport(ctx.env.network, ctx.device).trunk()) }),
            }),
          ],
        }),
        keyword('mac', 'MAC configuration', {
          when: CliWhens.switchPlatform,
          children: [keyword('address-table', 'MAC forwarding table', { run: showMacTable, children: macOptions })],
        }),
        keyword('mac-address-table', 'MAC forwarding table', { when: CliWhens.switchPlatform, hidden: true, run: showMacTable, children: macOptions }),
      ],
    }),
  },
  {
    modes: ['privilegedExec'],
    node: keyword('clear', 'Reset functions', {
      children: [
        keyword('mac', 'MAC configuration', {
          when: CliWhens.switchPlatform,
          children: [keyword('address-table', 'MAC forwarding table', { children: clearDynamic })],
        }),
        keyword('mac-address-table', 'MAC forwarding table', { when: CliWhens.switchPlatform, hidden: true, children: clearDynamic }),
      ],
    }),
  },
]
