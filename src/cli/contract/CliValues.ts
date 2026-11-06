// Parameter values the parser hands to command handlers (docs/CLI.md §3.2).
import type { RoutedPort, SubInterface, Svi, SwitchedPort } from '../../domain'

/**
 * An interface name as typed, normalized: 'g0/0', 'gig 0/0', 'GigabitEthernet0/0.10', 'vlan 10'.
 * Syntax only: whether the device has it is decided by DeviceInterfaces.
 */
export interface CliInterfaceName {
  /** IOS type name, e.g. 'GigabitEthernet', 'FastEthernet', 'Serial', 'Vlan'. */
  readonly type: string
  /** Slot / port numbers after the type, e.g. '0/0', '0/0/1', '10' (Vlan). */
  readonly number: string
  /** Sub-interface number after the dot ('Gi0/0.10' → 10); absent for a main interface. */
  readonly subInterface?: number
  /** Short id as the lab stores it: 'Gi0/0', 'Fa0/1', 'Se0/0/0', 'Vlan10', 'Gi0/0.10'. */
  readonly id: string
  /** Long IOS name: 'GigabitEthernet0/0', 'Vlan10', 'GigabitEthernet0/0.10'. */
  readonly longName: string
}

/** What one parameter matched. Keywords are not values: they are in `CliContext.path`. */
export type CliValue = string | number | readonly number[] | CliInterfaceName | readonly CliInterfaceName[]

/**
 * A configurable interface of a device, as the CLI and running-config see it. Console, host, radio
 * and passive ports are not interfaces here.
 */
export type CliInterface =
  | { readonly kind: 'port'; readonly id: string; readonly port: SwitchedPort | RoutedPort }
  | { readonly kind: 'subInterface'; readonly id: string; readonly parent: RoutedPort; readonly sub: SubInterface }
  | { readonly kind: 'svi'; readonly id: string; readonly svi: Svi }
