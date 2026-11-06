// `interface …` / `interface range …` (entering the modes, creating SVIs) and the generic interface
// commands: description, shutdown, speed, duplex. Addressing and switchport commands belong to C2 / C3.
import type { Device, PortDuplex, PortSpeed } from '../../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliEnvironment, CliInterfaceName } from '../../contract'
import { keyword, param } from '../CliNodes'
import { cliError, cliLog } from '../CliOutput'
import { DeviceEdits } from '../DeviceEdits'
import { DeviceInterfaces } from '../DeviceInterfaces'
import { InterfaceNames } from '../InterfaceNames'
import { LinkStatus } from '../LinkStatus'

const INVALID_INTERFACE = '%Invalid interface type and number'

/** The interface id the current interface / sub-interface mode points at. */
function currentInterfaceId(ctx: CliContext): string {
  if (ctx.mode.kind === 'interface' || ctx.mode.kind === 'subInterface') return ctx.mode.interfaceId
  throw new Error('Interface command outside interface mode')
}

function enterInterface(ctx: CliContext): CliCommandResult {
  const name = ctx.args.interface('name')
  const { device } = ctx
  if (name.subInterface !== undefined) {
    const parent = DeviceInterfaces.parentOf(device, name)
    if (parent === undefined) return { lines: cliError(INVALID_INTERFACE) }
    return { mode: { kind: 'subInterface', interfaceId: `${parent.id}.${name.subInterface}` } }
  }
  if (name.type === 'Vlan') return enterSvi(device, name)
  const found = DeviceInterfaces.resolve(device, name)
  return found === undefined ? { lines: cliError(INVALID_INTERFACE) } : { mode: { kind: 'interface', interfaceId: found.id } }
}

/** `interface vlan N` creates the SVI (admin up) when it does not exist yet. */
function enterSvi(device: Device, name: CliInterfaceName): CliCommandResult {
  const vlan = Number(name.number)
  const mode = { kind: 'interface' as const, interfaceId: name.id }
  if (DeviceInterfaces.resolve(device, name) !== undefined) return { mode }
  const created = DeviceEdits.updateSvi(device, vlan, (svi) => svi, () => ({
    vlan,
    adminUp: true,
    l3: { ipv4: { addressing: 'static', address: '', mask: '' } },
  }))
  return { mode, device: created, lines: cliLog(`%LINK-5-CHANGED: Interface ${name.longName}, changed state to up`) }
}

function removeInterface(ctx: CliContext): CliCommandResult {
  const name = ctx.args.interface('name')
  const found = DeviceInterfaces.resolve(ctx.device, name)
  if (found === undefined) return name.subInterface === undefined ? { lines: cliError(INVALID_INTERFACE) } : {}
  if (found.kind === 'subInterface') return { device: DeviceEdits.removeSubInterface(ctx.device, found.id) }
  if (found.kind === 'svi') return { device: DeviceEdits.removeSvi(ctx.device, found.svi.vlan) }
  return { lines: cliError('% Removal of physical interfaces is not permitted') }
}

function enterRange(ctx: CliContext): CliCommandResult {
  const ids: string[] = []
  for (const name of ctx.args.interfaces('names')) {
    const found = DeviceInterfaces.resolve(ctx.device, name)
    if (found === undefined || found.kind === 'subInterface') return { lines: cliError(`% Command rejected: ${name.longName} is not a valid interface`) }
    ids.push(found.id)
  }
  return { mode: { kind: 'interfaceRange', interfaceIds: ids } }
}

/** Sub-interfaces are created by `encapsulation dot1Q` (C3); before that these commands change nothing. */
function exists(device: Device, interfaceId: string): boolean {
  return DeviceInterfaces.find(device, interfaceId) !== undefined
}

/** IOS link messages after `shutdown` / `no shutdown`. */
function stateLogs(env: CliEnvironment, device: Device, interfaceId: string, adminUp: boolean): string[] {
  const longName = InterfaceNames.longName(interfaceId)
  if (!adminUp) return [`%LINK-5-CHANGED: Interface ${longName}, changed state to administratively down`]
  const iface = DeviceInterfaces.find(device, interfaceId)
  const portId = iface?.kind === 'port' ? iface.port.id : iface?.kind === 'subInterface' ? iface.parent.id : null
  const up = portId === null || LinkStatus.portUp(env.network, device, portId)
  return up
    ? [`%LINK-5-CHANGED: Interface ${longName}, changed state to up`, `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${longName}, changed state to up`]
    : [`%LINK-5-CHANGED: Interface ${longName}, changed state to down`]
}

function shutdown(ctx: CliContext, adminUp: boolean): CliCommandResult {
  const id = currentInterfaceId(ctx)
  if (!exists(ctx.device, id)) return {}
  const device = DeviceEdits.setAdminUp(ctx.device, id, adminUp)
  return { device, lines: cliLog(...stateLogs(ctx.env, device, id, adminUp)) }
}

function describe(ctx: CliContext, text: string | undefined): CliCommandResult {
  const id = currentInterfaceId(ctx)
  return exists(ctx.device, id) ? { device: DeviceEdits.setDescription(ctx.device, id, text) } : {}
}

/** speed / duplex: physical ports only (an SVI has none: nothing to change). */
function physical(ctx: CliContext, change: { speed?: PortSpeed; duplex?: PortDuplex }): CliCommandResult {
  const id = currentInterfaceId(ctx)
  const iface = DeviceInterfaces.find(ctx.device, id)
  if (iface?.kind !== 'port') return {}
  return { device: DeviceEdits.updatePort(ctx.device, iface.port.id, (port) => ({ ...port, ...change })) }
}

function speedNode(word: string, value: PortSpeed, help: string) {
  return keyword(word, help, { run: (ctx) => physical(ctx, { speed: value }) })
}

function duplexNode(word: string, value: PortDuplex, help: string) {
  return keyword(word, help, { run: (ctx) => physical(ctx, { duplex: value }) })
}

export const interfaceCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('interface', 'Select an interface to configure', {
      children: [
        param('name', { type: 'interface' }, 'Interface', { run: enterInterface, runNo: removeInterface }),
        keyword('range', 'interface range command', {
          children: [param('names', { type: 'interfaceRange' }, 'Interface range', { run: enterRange })],
        }),
      ],
    }),
  },
  {
    modes: ['interface', 'subInterface'],
    node: keyword('description', 'Interface specific description', {
      runNo: (ctx) => describe(ctx, undefined),
      children: [param('text', { type: 'line' }, 'Up to 240 characters describing this interface', { run: (ctx) => describe(ctx, ctx.args.text('text')) })],
    }),
  },
  {
    modes: ['interface', 'subInterface'],
    node: keyword('shutdown', 'Shutdown the selected interface', {
      run: (ctx) => shutdown(ctx, false),
      runNo: (ctx) => shutdown(ctx, true),
    }),
  },
  {
    modes: ['interface'],
    node: keyword('speed', 'Configure speed operation.', {
      runNo: (ctx) => physical(ctx, { speed: 'auto' }),
      children: [
        speedNode('10', 10, 'Force 10 Mbps operation'),
        speedNode('100', 100, 'Force 100 Mbps operation'),
        speedNode('1000', 1000, 'Force 1000 Mbps operation'),
        speedNode('auto', 'auto', 'Enable AUTO speed configuration'),
      ],
    }),
  },
  {
    modes: ['interface'],
    node: keyword('duplex', 'Configure duplex operation.', {
      runNo: (ctx) => physical(ctx, { duplex: 'auto' }),
      children: [
        duplexNode('auto', 'auto', 'Enable AUTO duplex configuration'),
        duplexNode('full', 'full', 'Force full duplex operation'),
        duplexNode('half', 'half', 'Force half-duplex operation'),
      ],
    }),
  },
]
