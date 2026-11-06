// Test-only: a 100-device lab (Web Worker split measurements, docs/SIMULATION.md §5.5).
import type { Device, Link, NetworkState } from '../domain'
import { accessMode, labCloud, labHost, labLink, labRouter, labSwitch, trunkMode } from '../engine/testLabs'

const ACCESS_SWITCHES = 4
const HOSTS_PER_SWITCH = 23

function vlanOf(port: number): number {
  return port % 2 === 0 ? 10 : 20
}

/** Host id on access switch `switchIndex`, port `port`. */
export function largeLabHost(switchIndex: number, port: number): string {
  return `h${switchIndex}x${port}`
}

/** Address of that host (static, VLAN 10 or 20). */
export function largeLabAddress(switchIndex: number, port: number): string {
  return `10.${vlanOf(port)}.${switchIndex}.${port + 10}`
}

/**
 * 100 devices (default; 4 + 24 per access switch): internet — router (VLAN 10 / 20 on a stick) — core switch — 4 access switches with 23
 * static hosts each (alternating VLANs, /16 per VLAN) + 1 server on the core = 1 + 1 + 1 + 4 + 92 + 1.
 */
export function largeLab(accessSwitches: number = ACCESS_SWITCHES): NetworkState {
  const router = labRouter(
    'router',
    [{ id: 'Gi0/0', subInterfaces: [{ vlan: 10, ip: '10.10.0.1', mask: '255.255.0.0' }, { vlan: 20, ip: '10.20.0.1', mask: '255.255.0.0' }] }, { id: 'Gi0/1' }],
    [{ prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }],
  )
  const devices: Device[] = [labCloud('isp'), router]
  const links: Link[] = [labLink('wan', ['isp', 'eth0'], ['router', 'Gi0/1']), labLink('uplink', ['router', 'Gi0/0'], ['core', 'Fa0/1'])]
  const corePorts = [trunkMode(), ...Array.from({ length: accessSwitches }, () => trunkMode()), accessMode(10)]
  devices.push(labSwitch('core', corePorts, [10, 20]))
  for (let index = 1; index <= accessSwitches; index += 1) {
    const ports = [trunkMode(), ...Array.from({ length: HOSTS_PER_SWITCH }, (_, port) => accessMode(vlanOf(port)))]
    devices.push(labSwitch(`acc${index}`, ports, [10, 20]))
    links.push(labLink(`core${index}`, ['core', `Fa0/${index + 1}`], [`acc${index}`, 'Fa0/1']))
    for (let port = 0; port < HOSTS_PER_SWITCH; port += 1) {
      const id = largeLabHost(index, port)
      devices.push(labHost(id, largeLabAddress(index, port), { mask: '255.255.0.0', gateway: `10.${vlanOf(port)}.0.1` }))
      links.push(labLink(`l${index}x${port}`, [id, 'eth0'], [`acc${index}`, `Fa0/${port + 2}`]))
    }
  }
  devices.push(labHost('server', '10.10.0.10', { kind: 'server', mask: '255.255.0.0', gateway: '10.10.0.1' }))
  links.push(labLink('serverLink', ['server', 'eth0'], ['core', `Fa0/${accessSwitches + 2}`]))
  return { devices, links }
}
