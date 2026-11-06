// Test-only devices for the config export goldens and round trips: configured through the CLI (core
// commands) or edited directly where the core has no command (VLAN database, end-device settings).
import type { Device, DeviceServices, L3Settings } from '../../domain'
import type { CliShell } from '../core/CliShell'
import { catalogDevice, CliDriver, testRouter, testSwitch } from '../core/testCli'
import { ConfigRoundTrip } from './ConfigRoundTrip'
import { LabConfigExport } from './LabConfigExport'

/** Types the lines after `enable` / `configure terminal` and returns the configured device. */
export function configured(device: Device, ...lines: readonly string[]): Device {
  const cli = new CliDriver(device)
  cli.typeAll('enable', 'configure terminal', ...lines, 'end')
  return cli.device
}

/** R1: passwords, encryption, banner, lines, a described LAN port brought up. */
export function sampleRouter(): Device {
  return configured(
    testRouter(),
    'hostname R1',
    'enable secret class',
    'service password-encryption',
    'banner motd #Authorized only#',
    'line con 0',
    'password cisco',
    'login',
    'logging synchronous',
    'exit',
    'line vty 0 4',
    'password vty',
    'exec-timeout 5 0',
    'exit',
    'interface g0/0',
    'description LAN',
    'no shutdown',
  )
}

/** S1: no domain lookup, a fixed-speed port, a shut port, enable password. */
export function sampleSwitch(): Device {
  return configured(
    testSwitch(),
    'hostname S1',
    'no ip domain-lookup',
    'enable password cisco',
    'interface fa0/1',
    'description PC1',
    'speed 100',
    'duplex full',
    'interface fa0/2',
    'shutdown',
  )
}

/** Adds VLANs to the database directly (the core has no `vlan` command; C2 registers it). */
export function withVlans(device: Device, vlans: readonly { id: number; name: string }[]): Device {
  const switching = device.switching
  if (switching === undefined) throw new Error(`${device.id} has no switching settings`)
  return { ...device, switching: { ...switching, vlans: [...switching.vlans, ...vlans] } }
}

/** MS1: an L3 switch with its Vlan1 SVI up and described, a multi-line banner. */
export function sampleL3Switch(): Device {
  return configured(
    catalogDevice('l3Switch24', 'ms1', '00:D0:BA:00:00:03'),
    'hostname MS1',
    'banner motd #',
    'Core switch',
    'Authorized staff only',
    '#',
    'interface vlan 1',
    'description Management',
    'no shutdown',
    'interface g1/1/1',
    'description Uplink',
  )
}

/** R2: four Ethernet ports, two serial; enable password typed plain, vty login without password. */
export function sampleSerialRouter(): Device {
  return configured(
    catalogDevice('router4PortSerial', 'r2', '00:D0:BA:00:00:06'),
    'hostname BRANCH',
    'enable password secret1',
    'interface range g0/0 - 1',
    'no shutdown',
    'description Branch LAN',
    'interface se0/1/0',
    'description WAN to HQ',
    'no shutdown',
    'line vty 0 4',
    'logging synchronous',
  )
}

/** S2: a 48-port switch with encrypted line passwords and a single-line banner. */
export function sampleAccessSwitch(): Device {
  return configured(
    catalogDevice('switch48', 's2', '00:D0:BA:00:00:07'),
    'hostname FLOOR2',
    'service password-encryption',
    'banner motd $Floor 2 access$',
    'line console 0',
    'password con',
    'login',
    'exec-timeout 0 0',
    'line vty 0 15',
    'password tel',
    'interface range fa0/40 - 48',
    'shutdown',
    'description unused',
  )
}

function nic(address: string, mask: string): L3Settings {
  return { ipv4: { addressing: 'static', address, mask } }
}

/** PC1: static eth0, gateway and two DNS servers. */
export function samplePc(): Device {
  const device = catalogDevice('pc', 'pc1', '00:D0:BA:00:00:05')
  return {
    ...device,
    name: 'Reception PC',
    ports: device.ports.map((port) => (port.id === 'eth0' && port.role === 'host' ? { ...port, l3: nic('192.168.1.10', '255.255.255.0') } : port)),
    host: { defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.2', '8.8.8.8'], appLinks: [] },
  }
}

/** SRV1: DHCP and DNS server on eth0. */
export function sampleServer(): Device {
  const device = catalogDevice('server', 'srv1', '00:D0:BA:00:00:08')
  const services: DeviceServices = {
    dhcp: {
      enabled: true,
      pools: [
        {
          id: 'LAN',
          network: '192.168.1.0',
          mask: '255.255.255.0',
          range: { start: '192.168.1.100', end: '192.168.1.199' },
          defaultRouter: '192.168.1.1',
          dnsServers: ['192.168.1.2'],
          leases: [{ mac: '00:D0:BA:00:00:05', ip: '192.168.1.100' }],
        },
      ],
      excludedRanges: [{ start: '192.168.1.150', end: '192.168.1.150' }],
    },
    dns: { enabled: true, forwarders: ['8.8.8.8'], records: [{ type: 'A', name: 'intranet.local', address: '192.168.1.2' }] },
  }
  return {
    ...device,
    ports: device.ports.map((port) => (port.id === 'eth0' && port.role === 'host' ? { ...port, l3: nic('192.168.1.2', '255.255.255.0') } : port)),
    host: { defaultGateway: '192.168.1.1', dnsServers: ['127.0.0.1'], appLinks: [] },
    services,
  }
}

/** Exports the lab, splits the file and replays each CLI device's section on its factory configuration. */
export function rebuildThroughLabExport(shell: CliShell, devices: readonly Device[]): Device[] {
  const roundTrip = new ConfigRoundTrip(shell)
  const sections = LabConfigExport.split(new LabConfigExport(shell).text({ devices: [...devices], links: [] }, { title: 'Round trip' }))
  return devices.map((device) => {
    const section = sections.find((candidate) => candidate.deviceId === device.id)
    if (section === undefined) throw new Error(`No section for ${device.id}`)
    return roundTrip.replay(device, section.lines.join('\n'))
  })
}
