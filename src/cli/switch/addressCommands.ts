// Addressing of a switch: `ip address` on SVIs (and routed ports of an L3 switch), `ip default-gateway`.
// The `ip address` registration is separate so the integrator can leave it to the router set when that
// one handles every L3 interface (docs/CLI.md §8: one handler per merged node).
import type { Device, Ipv4Settings } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliInterface } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { DeviceEdits } from '../core/DeviceEdits'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { InterfaceNames } from '../core/InterfaceNames'
import { currentInterface } from './switchContext'

const NO_ADDRESS: Ipv4Settings = { addressing: 'static', address: '', mask: '' }

/** IPv4 settings of an interface that can hold an address; null for switchports. */
export function ipv4Of(iface: CliInterface): Ipv4Settings | null {
  switch (iface.kind) {
    case 'svi':
      return iface.svi.l3.ipv4
    case 'subInterface':
      return iface.sub.l3.ipv4
    case 'port':
      return iface.port.role === 'routed' ? iface.port.l3.ipv4 : null
  }
}

function maskHex(mask: string): string {
  return (Ipv4.parse(mask) ?? 0).toString(16).toUpperCase()
}

/** IOS refuses a subnet that overlaps the subnet of another interface of the device. */
function overlapping(device: Device, ownId: string, address: string, mask: string): string | null {
  for (const other of DeviceInterfaces.list(device)) {
    const ipv4 = other.id === ownId ? null : ipv4Of(other)
    if (ipv4 === null || ipv4.address === '' || !Ipv4.isValidMask(ipv4.mask)) continue
    const shorter = (Ipv4.prefixLength(ipv4.mask) ?? 32) < (Ipv4.prefixLength(mask) ?? 32) ? ipv4.mask : mask
    if (!Ipv4.sameSubnet(address, ipv4.address, shorter)) continue
    return `% ${Ipv4.format(Ipv4.network(address, mask) ?? 0)} overlaps with ${InterfaceNames.longName(other.id)}`
  }
  return null
}

/** Applies new IPv4 settings to the current SVI / routed port. */
function setIpv4(ctx: CliContext, ipv4: Ipv4Settings): CliCommandResult {
  const iface = currentInterface(ctx)
  if (iface === undefined) return {}
  if (ipv4Of(iface) === null) return { lines: cliError('% IP addresses may not be configured on L2 links.') }
  return { device: DeviceEdits.updateL3(ctx.device, iface.id, (l3) => ({ ...l3, ipv4 })) }
}

function setStatic(ctx: CliContext): CliCommandResult {
  const address = ctx.args.text('address')
  const mask = ctx.args.text('mask')
  if (!Ipv4.isValidMask(mask)) return { lines: cliError(`Bad mask 0x${maskHex(mask)} for address ${address}`) }
  if (!Ipv4.isHostAddress(address, mask)) return { lines: cliError(`Bad mask /${Ipv4.prefixLength(mask) ?? 0} for address ${address}`) }
  const iface = currentInterface(ctx)
  const overlap = iface === undefined ? null : overlapping(ctx.device, iface.id, address, mask)
  if (overlap !== null) return { lines: cliError(overlap) }
  return setIpv4(ctx, { addressing: 'static', address, mask })
}

function setDefaultGateway(ctx: CliContext, gateway: string): CliCommandResult {
  const switching = ctx.device.switching
  if (switching === undefined) return {}
  return { device: { ...ctx.device, switching: { ...switching, defaultGateway: gateway } } }
}

const removeAddress = (ctx: CliContext): CliCommandResult => setIpv4(ctx, NO_ADDRESS)

/** Interface mode `ip address A.B.C.D A.B.C.D | dhcp` and `no ip address`. */
export const ipAddressCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['interface'],
    node: keyword('ip', 'Interface Internet Protocol config commands', {
      children: [
        keyword('address', 'Set the IP address of an interface', {
          when: CliWhens.switchPlatform,
          runNo: removeAddress,
          children: [
            param('address', { type: 'ipv4' }, 'IP address', {
              children: [param('mask', { type: 'ipv4' }, 'IP subnet mask', { run: setStatic, runNo: removeAddress })],
            }),
            keyword('dhcp', 'IP Address negotiated via DHCP', {
              run: (ctx) => setIpv4(ctx, { addressing: 'dhcp', address: '', mask: '' }),
              runNo: removeAddress,
            }),
          ],
        }),
      ],
    }),
  },
]

/** `ip default-gateway`; `leave` = typed in the interface mode, where IOS runs it in global config. */
function defaultGatewayNode(leave: boolean) {
  const exit = (result: CliCommandResult): CliCommandResult => (leave ? { ...result, mode: { kind: 'globalConfig' } } : result)
  return keyword('default-gateway', 'Specify default gateway (if not routing IP)', {
    when: CliWhens.switchPlatform,
    hidden: leave,
    runNo: (ctx) => exit(setDefaultGateway(ctx, '')),
    children: [
      param('gateway', { type: 'ipv4' }, 'IP address of default gateway', {
        run: (ctx) => exit(setDefaultGateway(ctx, ctx.args.text('gateway'))),
        runNo: (ctx) => exit(setDefaultGateway(ctx, '')),
      }),
    ],
  })
}

/**
 * Global `ip default-gateway` (management traffic of a switch that does not route). The interface-mode
 * copy is the sub-mode fallback for a line whose first word (`ip`) the interface mode knows too: the core
 * falls back to global config only when the first word is unknown, and running-config writes this line
 * right after the interface blocks.
 */
export const defaultGatewayCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('ip', 'Global IP configuration subcommands', { children: [defaultGatewayNode(false)] }),
  },
  {
    modes: ['interface'],
    node: keyword('ip', 'Interface Internet Protocol config commands', { children: [defaultGatewayNode(true)] }),
  },
]
