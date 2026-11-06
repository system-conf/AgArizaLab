// `vlan <list>` (global config, enters the VLAN mode) and `name` in the VLAN mode. The database is not part
// of running-config (vlan.dat on IOS, docs/CLI.md §6).
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { VlanDatabase } from './VlanDatabase'

function vlanIdsOf(ctx: CliContext): readonly number[] {
  if (ctx.mode.kind === 'vlan') return ctx.mode.vlanIds
  throw new Error('VLAN command outside the VLAN mode')
}

function enterVlans(ctx: CliContext): CliCommandResult {
  const ids = ctx.args.numbers('ids')
  const device = VlanDatabase.ensure(ctx.device, ids)
  return { mode: { kind: 'vlan', vlanIds: ids }, ...(device === ctx.device ? {} : { device }) }
}

function removeVlans(ctx: CliContext): CliCommandResult {
  const ids = ctx.args.numbers('ids')
  const refused = ids.filter((id) => VlanDatabase.isDefault(id)).map((id) => `%Default VLAN ${id} may not be deleted.`)
  const device = VlanDatabase.remove(ctx.device, ids)
  return { ...(refused.length === 0 ? {} : { lines: cliError(...refused) }), ...(device === ctx.device ? {} : { device }) }
}

function rename(ctx: CliContext, name: string | undefined): CliCommandResult {
  const ids = vlanIdsOf(ctx)
  const refused = ids.filter((id) => VlanDatabase.isDefault(id)).map((id) => `%Default VLAN ${id} may not have its name changed.`)
  const device = VlanDatabase.rename(ctx.device, ids, name)
  return { ...(refused.length === 0 ? {} : { lines: cliError(...refused) }), device }
}

export const vlanCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('vlan', 'Vlan commands', {
      when: CliWhens.switchPlatform,
      children: [param('ids', { type: 'vlanList' }, 'VLAN ID 1-4094', { run: enterVlans, runNo: removeVlans })],
    }),
  },
  {
    modes: ['vlan'],
    node: keyword('name', 'Ascii name of the VLAN', {
      runNo: (ctx) => rename(ctx, undefined),
      children: [param('name', { type: 'word' }, 'The ascii name for the VLAN', { run: (ctx) => rename(ctx, ctx.args.text('name')) })],
    }),
  },
]
