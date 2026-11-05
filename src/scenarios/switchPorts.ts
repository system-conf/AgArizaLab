import type { SwitchPort } from '../domain/NetworkTypes'

/**
 * Builds ports Fa0/1..Fa0/<count> as enabled access ports in `vlan`.
 * `overrides` replaces fields of individual ports, keyed by port id.
 */
export function buildSwitchPorts(
  count: number,
  vlan: number,
  poe: boolean,
  overrides: Record<string, Partial<Omit<SwitchPort, 'id'>>> = {},
): SwitchPort[] {
  const ports: SwitchPort[] = []
  for (let index = 1; index <= count; index += 1) {
    const id = `Fa0/${index}`
    ports.push({ id, vlan, mode: 'access', enabled: true, poe, ...overrides[id] })
  }
  return ports
}
