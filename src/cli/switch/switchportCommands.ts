// `switchport …` in the interface mode: access / trunk mode, access VLAN, native VLAN, allowed VLANs, and
// `switchport` / `no switchport` (L3 switch: switchport ↔ routed port).
import type { Device, RoutedPort, SwitchedPort, SwitchportSettings } from '../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { CliErrors } from '../core/CliErrors'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliError, cliLog } from '../core/CliOutput'
import { CliPrompt } from '../core/CliPrompt'
import { DeviceEdits } from '../core/DeviceEdits'
import { InterfaceNames } from '../core/InterfaceNames'
import { LinkStatus } from '../core/LinkStatus'
import { currentInterface, currentSwitchport, isLayer3Switch, isSwitchport } from './switchContext'
import { VlanDatabase } from './VlanDatabase'
import { type AllowedVlans, VlanLists } from './VlanLists'

/** Factory switchport settings (a routed L3-switch port turned back into a switchport). */
const FACTORY_L2: SwitchportSettings = { mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' }

type L2Change = (l2: SwitchportSettings) => SwitchportSettings

/** Applies `change` to the current switchport's layer-2 settings. */
function editL2(ctx: CliContext, change: L2Change): CliCommandResult {
  const port = currentSwitchport(ctx)
  if (!isSwitchport(port)) return port
  return { device: DeviceEdits.updateSwitchedPort(ctx.device, port.id, (value) => ({ ...value, l2: change(value.l2) })) }
}

/** `switchport mode access|trunk`; an up port renegotiates (line protocol down, then up). */
function setMode(ctx: CliContext, mode: SwitchportSettings['mode']): CliCommandResult {
  const port = currentSwitchport(ctx)
  if (!isSwitchport(port)) return port
  if (port.l2.mode === mode) return {}
  const device = DeviceEdits.updateSwitchedPort(ctx.device, port.id, (value) => ({ ...value, l2: { ...value.l2, mode } }))
  if (!LinkStatus.portUp(ctx.env.network, device, port.id)) return { device }
  const longName = InterfaceNames.longName(port.id)
  const log = (state: string) => `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${longName}, changed state to ${state}`
  return { device, lines: cliLog(log('down'), log('up')) }
}

/** `switchport access vlan N`: IOS creates a missing VLAN. */
function setAccessVlan(ctx: CliContext, vlan: number): CliCommandResult {
  const result = editL2(ctx, (l2) => ({ ...l2, accessVlan: vlan }))
  if (result.device === undefined || VlanDatabase.has(ctx.device, vlan)) return result
  return { device: VlanDatabase.ensure(result.device, [vlan]), lines: cliError(`% Access VLAN does not exist. Creating vlan ${vlan}`) }
}

function setAllowed(ctx: CliContext, change: (allowed: AllowedVlans) => AllowedVlans): CliCommandResult {
  return editL2(ctx, (l2) => ({ ...l2, allowedVlans: change(l2.allowedVlans) }))
}

function commonOf(port: SwitchedPort | RoutedPort): Omit<SwitchedPort, 'role' | 'l2'> {
  return {
    id: port.id,
    medium: port.medium,
    adminUp: port.adminUp,
    ...(port.mac === undefined ? {} : { mac: port.mac }),
    ...(port.description === undefined ? {} : { description: port.description }),
    ...(port.speed === undefined ? {} : { speed: port.speed }),
    ...(port.duplex === undefined ? {} : { duplex: port.duplex }),
    ...(port.autoMdix === undefined ? {} : { autoMdix: port.autoMdix }),
    ...(port.pinout === undefined ? {} : { pinout: port.pinout }),
    ...(port.poe === undefined ? {} : { poe: port.poe }),
  }
}

/** `switchport` / `no switchport`: the port becomes a switchport or a routed port (L3 switch only). */
function setSwitchport(ctx: CliContext, switched: boolean): CliCommandResult {
  if (!isLayer3Switch(ctx.device)) {
    if (switched) return { lines: cliError(...CliErrors.incomplete()) }
    // `no switchport` on a layer-2 switch: the caret sits under `switchport`.
    return { lines: cliError(...CliErrors.invalid(CliPrompt.render(ctx.device, ctx.mode).length + 'no '.length)) }
  }
  const iface = currentInterface(ctx)
  if (iface?.kind !== 'port') return {}
  const port = iface.port
  if ((port.role === 'switched') === switched) return {}
  const next: SwitchedPort | RoutedPort = switched
    ? { ...commonOf(port), role: 'switched', l2: { ...FACTORY_L2 } }
    : { ...commonOf(port), role: 'routed', l3: { ipv4: { addressing: 'static', address: '', mask: '' } }, subInterfaces: [] }
  const device: Device = DeviceEdits.updatePort(ctx.device, port.id, () => next)
  return { device }
}

function vlanNumber(name: string, help: string, run: (ctx: CliContext, vlan: number) => CliCommandResult) {
  return param(name, { type: 'number', min: 1, max: 4094 }, help, { run: (ctx) => run(ctx, ctx.args.number(name)) })
}

function vlanList(help: string, run: (ctx: CliContext, ids: readonly number[]) => CliCommandResult) {
  return param('vlans', { type: 'vlanList' }, help, { run: (ctx) => run(ctx, ctx.args.numbers('vlans')) })
}

const modeNode = keyword('mode', 'Set trunking mode of the interface', {
  runNo: (ctx) => setMode(ctx, 'access'),
  children: [
    keyword('access', 'Set trunking mode to ACCESS unconditionally', { run: (ctx) => setMode(ctx, 'access') }),
    keyword('trunk', 'Set trunking mode to TRUNK unconditionally', { run: (ctx) => setMode(ctx, 'trunk') }),
  ],
})

const accessNode = keyword('access', 'Set access mode characteristics of the interface', {
  children: [
    keyword('vlan', 'Set VLAN when interface is in access mode', {
      runNo: (ctx) => setAccessVlan(ctx, 1),
      children: [vlanNumber('vlan', 'VLAN ID of the VLAN when this port is in access mode', setAccessVlan)],
    }),
  ],
})

const allowedVlanNode = keyword('vlan', 'Set allowed VLANs when interface is in trunking mode', {
  runNo: (ctx) => setAllowed(ctx, () => 'all'),
  children: [
    vlanList('VLAN IDs of the allowed VLANs when this port is in trunking mode', (ctx, ids) => setAllowed(ctx, () => VlanLists.allowed(ids))),
    keyword('add', 'add VLANs to the current list', {
      children: [vlanList('VLAN IDs of the allowed VLANs when this port is in trunking mode', (ctx, ids) => setAllowed(ctx, (allowed) => VlanLists.add(allowed, ids)))],
    }),
    keyword('all', 'all VLANs', { run: (ctx) => setAllowed(ctx, () => 'all') }),
    keyword('except', 'all VLANs except the following', {
      children: [vlanList('VLAN IDs of the disallowed VLANS when this port is in trunking mode', (ctx, ids) => setAllowed(ctx, () => VlanLists.except(ids)))],
    }),
    keyword('none', 'no VLANs', { run: (ctx) => setAllowed(ctx, () => []) }),
    keyword('remove', 'remove VLANs from the current list', {
      children: [vlanList('VLAN IDs of disallowed VLANS when this port is in trunking mode', (ctx, ids) => setAllowed(ctx, (allowed) => VlanLists.remove(allowed, ids)))],
    }),
  ],
})

/** Accepted for configs written for a 3560 (the lab's trunks always use 802.1Q): changes nothing. */
function acceptEncapsulation(ctx: CliContext): CliCommandResult {
  const port = currentSwitchport(ctx)
  return isSwitchport(port) ? {} : port
}

const encapsulationNode = keyword('encapsulation', 'Set trunking encapsulation when interface is in trunking mode', {
  when: isLayer3Switch,
  runNo: acceptEncapsulation,
  children: [keyword('dot1q', 'Interface uses only 802.1q trunking encapsulation when trunking', { run: acceptEncapsulation })],
})

const trunkNode = keyword('trunk', 'Set trunking characteristics of the interface', {
  children: [
    keyword('allowed', 'Set allowed VLAN characteristics when interface is in trunking mode', { children: [allowedVlanNode] }),
    encapsulationNode,
    keyword('native', 'Set trunking native characteristics when interface is in trunking mode', {
      children: [
        keyword('vlan', 'Set native VLAN when interface is in trunking mode', {
          runNo: (ctx) => editL2(ctx, (l2) => ({ ...l2, nativeVlan: 1 })),
          children: [
            vlanNumber('vlan', 'VLAN ID of the native VLAN when this port is in trunking mode', (ctx, vlan) =>
              editL2(ctx, (l2) => ({ ...l2, nativeVlan: vlan })),
            ),
          ],
        }),
      ],
    }),
  ],
})

export const switchportCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['interface'],
    node: keyword('switchport', 'Set switching mode characteristics', {
      when: CliWhens.switchPlatform,
      run: (ctx) => setSwitchport(ctx, true),
      runNo: (ctx) => setSwitchport(ctx, false),
      children: [accessNode, modeNode, trunkNode],
    }),
  },
]
