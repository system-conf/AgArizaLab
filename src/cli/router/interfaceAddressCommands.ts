// Layer-3 interface commands (docs/CLI.md §8, C3): `ip address`, `ip helper-address`, sub-interfaces with
// `encapsulation dot1Q <vlan> [native]`, and `clock rate` on serial ports. Work on routed ports,
// sub-interfaces and SVIs (L3 switches); every member of an interface range is handled alone.
import type { L3Settings, RoutedPort, SerialSettings, SubInterface } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import { L3Interfaces } from '../../net/L3Interfaces'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliInterface } from '../contract'
import { CliErrors } from '../core/CliErrors'
import { keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { CliPrompt } from '../core/CliPrompt'
import { DeviceEdits } from '../core/DeviceEdits'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { InterfaceNames } from '../core/InterfaceNames'
import { noAddress, RouterEdits } from './RouterEdits'

const L2_LINK = '% IP addresses may not be configured on L2 links.'
const SUBIF_WITHOUT_VLAN = [
  '% Configuring IP routing on a LAN subinterface is only allowed if that',
  'subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,',
  'or ISL vLAN.',
]
const MAX_HELPERS = 20
const MIN_CLOCK_RATE = 300
const MAX_CLOCK_RATE = 8_000_000

/** The L3 interface of the current mode, or the IOS error why there is none. */
function l3Target(ctx: CliContext): { readonly iface: CliInterface } | { readonly error: CliCommandResult } {
  const iface = RouterEdits.current(ctx)
  if (iface === undefined) return { error: { lines: cliError(...SUBIF_WITHOUT_VLAN) } }
  if (iface.kind === 'port' && iface.port.role === 'switched') return { error: { lines: cliError(L2_LINK) } }
  return { iface }
}

function maskHex(mask: string): string {
  return (Ipv4.parse(mask) ?? 0).toString(16).toUpperCase().padStart(8, '0')
}

/** Another interface of the device whose subnet overlaps address/mask. */
function overlapping(ctx: CliContext, ownId: string, address: string, mask: string): string | undefined {
  const other = L3Interfaces.of(ctx.device).find(
    (candidate) =>
      candidate.id !== ownId &&
      L3Interfaces.isAddressed(candidate) &&
      (Ipv4.inNetwork(candidate.address, address, mask) || Ipv4.inNetwork(address, candidate.address, candidate.mask)),
  )
  return other?.id
}

function updateL3(ctx: CliContext, iface: CliInterface, change: (l3: L3Settings) => L3Settings): CliCommandResult {
  return { device: DeviceEdits.updateL3(ctx.device, iface.id, change) }
}

function setAddress(ctx: CliContext): CliCommandResult {
  const target = l3Target(ctx)
  if ('error' in target) return target.error
  const address = ctx.args.text('address')
  const mask = ctx.args.text('mask')
  if (!Ipv4.isValidMask(mask)) return { lines: cliError(`Bad mask 0x${maskHex(mask)} for address ${address}`) }
  if (!Ipv4.isHostAddress(address, mask)) return { lines: cliError(`Bad mask /${Ipv4.prefixLength(mask) ?? 0} for address ${address}`) }
  const clash = overlapping(ctx, target.iface.id, address, mask)
  if (clash !== undefined) {
    const network = Ipv4.format(Ipv4.network(address, mask) ?? 0)
    return { lines: cliError(`% ${network} overlaps with ${InterfaceNames.longName(clash)}`) }
  }
  return updateL3(ctx, target.iface, (l3) => ({ ...l3, ipv4: { addressing: 'static', address, mask } }))
}

function setDhcpAddress(ctx: CliContext): CliCommandResult {
  const target = l3Target(ctx)
  if ('error' in target) return target.error
  return updateL3(ctx, target.iface, (l3) => ({ ...l3, ipv4: { addressing: 'dhcp', address: '', mask: '' } }))
}

function removeAddress(ctx: CliContext): CliCommandResult {
  const iface = RouterEdits.current(ctx)
  if (iface === undefined || (iface.kind === 'port' && iface.port.role === 'switched')) return {}
  return updateL3(ctx, iface, (l3) => ({ ...l3, ipv4: noAddress().ipv4 }))
}

function withHelpers(l3: L3Settings, helpers: readonly string[]): L3Settings {
  const copy = { ...l3 }
  if (helpers.length === 0) delete copy.helperAddresses
  else copy.helperAddresses = [...helpers]
  return copy
}

function addHelper(ctx: CliContext): CliCommandResult {
  const target = l3Target(ctx)
  if ('error' in target) return target.error
  const helper = ctx.args.text('helper')
  return updateL3(ctx, target.iface, (l3) => {
    const helpers = l3.helperAddresses ?? []
    if (helpers.includes(helper) || helpers.length >= MAX_HELPERS) return l3
    return withHelpers(l3, [...helpers, helper])
  })
}

function removeHelper(ctx: CliContext): CliCommandResult {
  const iface = RouterEdits.current(ctx)
  if (iface === undefined || (iface.kind === 'port' && iface.port.role === 'switched')) return {}
  const helper = ctx.args.has('helper') ? ctx.args.text('helper') : null
  return updateL3(ctx, iface, (l3) => withHelpers(l3, helper === null ? [] : (l3.helperAddresses ?? []).filter((item) => item !== helper)))
}

function withNative(sub: SubInterface, native: boolean): SubInterface {
  const copy = { ...sub }
  if (native) copy.native = true
  else delete copy.native
  return copy
}

/** `encapsulation dot1Q <vlan> [native]`: creates the sub-interface on first use. */
function encapsulate(ctx: CliContext, native: boolean): CliCommandResult {
  const id = RouterEdits.currentId(ctx)
  const parent = DeviceInterfaces.find(ctx.device, id.slice(0, id.lastIndexOf('.')))
  if (parent?.kind !== 'port' || parent.port.role !== 'routed') return { lines: cliError('%Invalid interface type and number') }
  const vlan = ctx.args.number('vlan')
  const clash = parent.port.subInterfaces.find((sub) => sub.id !== id && sub.vlan === vlan)
  if (clash !== undefined) {
    return {
      lines: cliError(
        `Configuration of multiple subinterfaces of the same main interface with the same VID (${vlan}) is not permitted.`,
        `This VID is already configured on ${InterfaceNames.longName(clash.id)}.`,
      ),
    }
  }
  const create = (): SubInterface => ({ id, vlan, adminUp: true, l3: noAddress() })
  return { device: DeviceEdits.updateSubInterface(ctx.device, id, (sub) => withNative({ ...sub, vlan }, native), create) }
}

/** The serial port of the current mode; null on other interfaces (`clock rate` does not exist there). */
function serialPort(ctx: CliContext): RoutedPort | null {
  const iface = RouterEdits.current(ctx)
  return iface?.kind === 'port' && iface.port.role === 'routed' && iface.port.medium === 'serial' ? iface.port : null
}

function withClockRate(port: RoutedPort, clockRate: number | undefined): RoutedPort {
  const serial: SerialSettings = { ...port.serial }
  if (clockRate === undefined) delete serial.clockRate
  else serial.clockRate = clockRate
  const copy = { ...port }
  if (Object.keys(serial).length === 0) delete copy.serial
  else copy.serial = serial
  return copy
}

function clockRate(ctx: CliContext, rate: number | undefined): CliCommandResult {
  const port = serialPort(ctx)
  if (port === null) return { lines: cliError(...CliErrors.invalid(CliPrompt.render(ctx.device, ctx.mode).length)) }
  return { device: DeviceEdits.updateRoutedPort(ctx.device, port.id, (value) => withClockRate(value, rate)) }
}

const addressNode = keyword('address', 'Set the IP address of an interface', {
  runNo: removeAddress,
  children: [
    keyword('dhcp', 'IP Address negotiated via DHCP', { run: setDhcpAddress, runNo: removeAddress }),
    param('address', { type: 'ipv4' }, 'IP address', {
      children: [param('mask', { type: 'ipv4' }, 'IP subnet mask', { run: setAddress, runNo: removeAddress })],
    }),
  ],
})

const helperNode = keyword('helper-address', 'Specify a destination address for UDP broadcasts', {
  runNo: removeHelper,
  children: [param('helper', { type: 'ipv4' }, 'IP destination address', { run: addHelper, runNo: removeHelper })],
})

export const interfaceAddressCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['interface', 'subInterface'],
    node: keyword('ip', 'Interface Internet Protocol config commands', { children: [addressNode, helperNode] }),
  },
  {
    modes: ['subInterface'],
    node: keyword('encapsulation', 'Set encapsulation type for an interface', {
      children: [
        keyword('dot1Q', 'IEEE 802.1Q Virtual LAN', {
          children: [
            param('vlan', { type: 'number', min: 1, max: 4094 }, 'IEEE 802.1Q VLAN ID', {
              run: (ctx) => encapsulate(ctx, false),
              children: [keyword('native', 'Make this as native vlan', { run: (ctx) => encapsulate(ctx, true) })],
            }),
          ],
        }),
      ],
    }),
  },
  {
    modes: ['interface'],
    node: keyword('clock', 'Configure serial interface clock', {
      children: [
        keyword('rate', 'Configure serial interface clock speed', {
          runNo: (ctx) => clockRate(ctx, undefined),
          children: [
            param('rate', { type: 'number', min: MIN_CLOCK_RATE, max: MAX_CLOCK_RATE }, 'Choose clockrate from list above', {
              run: (ctx) => clockRate(ctx, ctx.args.number('rate')),
            }),
          ],
        }),
      ],
    }),
  },
]
