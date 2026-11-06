// Test-only: flat labs of any size (one VLAN, one /16) for the settle performance tests.
import type { Device, Link, NetworkState } from '../../domain'
import { accessMode, labHost, labLink, labSwitch, trunkMode } from '../../engine/testLabs'

const HOSTS_PER_SWITCH = 24

/** Host `index` (0-based): 10.0.<index / 200>.<index % 200 + 10>. */
export function flatTestLabAddress(index: number): string {
  return `10.0.${Math.floor(index / 200)}.${(index % 200) + 10}`
}

export function flatTestLabHost(index: number): string {
  return `h${index}`
}

/**
 * `deviceCount` devices in one broadcast domain: a core switch, access switches on its trunks, and
 * static hosts (24 per access switch) in VLAN 1 of 10.0.0.0/16 — every start-up probe floods them all.
 */
export function flatTestLab(deviceCount: number): NetworkState {
  let switches = 1
  while (1 + switches + switches * HOSTS_PER_SWITCH < deviceCount) switches += 1
  const hosts = deviceCount - 1 - switches
  const devices: Device[] = [labSwitch('core', Array.from({ length: switches }, () => trunkMode()))]
  const links: Link[] = []
  for (let index = 0; index < switches; index += 1) {
    const id = `acc${index}`
    const count = Math.min(HOSTS_PER_SWITCH, hosts - index * HOSTS_PER_SWITCH)
    devices.push(labSwitch(id, [trunkMode(), ...Array.from({ length: Math.max(count, 0) }, () => accessMode(1))]))
    links.push(labLink(`up${index}`, ['core', `Fa0/${index + 1}`], [id, 'Fa0/1']))
  }
  for (let index = 0; index < hosts; index += 1) {
    const id = flatTestLabHost(index)
    const access = Math.floor(index / HOSTS_PER_SWITCH)
    devices.push(labHost(id, flatTestLabAddress(index), { mask: '255.255.0.0' }))
    links.push(labLink(`l${index}`, [id, 'eth0'], [`acc${access}`, `Fa0/${(index % HOSTS_PER_SWITCH) + 2}`]))
  }
  return { devices, links }
}
