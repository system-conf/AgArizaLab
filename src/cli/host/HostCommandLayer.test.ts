import { describe, expect, it } from 'vitest'
import type { Device, DnsServerSettings } from '../../domain'
import type { DeviceRuntime, ServiceSession } from '../../sim/contract'
import { RuntimeTables } from '../../sim/core/RuntimeTables'
import type { CliEnvironment } from '../contract'
import { catalogDevice, testRouter, textOf } from '../core/testCli'
import { HostCommandLayer } from './HostCommandLayer'

function withNic(device: Device, address: string, addressing: 'static' | 'dhcp' = 'static'): Device {
  return {
    ...device,
    ports: device.ports.map((port) =>
      port.id === 'eth0' && port.role === 'host' ? { ...port, l3: { ipv4: { addressing, address, mask: '255.255.255.0' } } } : port,
    ),
  }
}

function pc(addressing: 'static' | 'dhcp' = 'static'): Device {
  return withNic(catalogDevice('pc', 'pc1', '00:D0:BA:00:00:10'), '192.168.1.10', addressing)
}

function dnsServer(): Device {
  const dns: DnsServerSettings = { enabled: true, forwarders: [], records: [] }
  const server = withNic(catalogDevice('server', 'srv1', '00:D0:BA:00:00:20'), '192.168.1.2')
  return { ...server, services: { ...server.services, dns } }
}

function runtimeOf(device: Device, change: (runtime: DeviceRuntime) => DeviceRuntime = (runtime) => runtime): DeviceRuntime {
  return change(RuntimeTables.empty(device.id))
}

function env(device: Device, runtime?: DeviceRuntime, now = 0): CliEnvironment {
  return { network: { devices: [device], links: [] }, runtime, now }
}

function run(device: Device, line: string, environment: CliEnvironment = env(device)): string[] {
  const result = HostCommandLayer.run(device, environment, line)
  if (result === null) throw new Error(`not handled: ${line}`)
  return textOf(result.lines)
}

function withSessions(sessions: readonly ServiceSession[]) {
  return (runtime: DeviceRuntime): DeviceRuntime => ({ ...runtime, services: { ...runtime.services, sessions } })
}

describe('host command layer: routing to SimTerminal', () => {
  it('answers only its own commands', () => {
    for (const line of ['hostname', 'HOSTNAME', 'netstat -an', 'ipconfig /displaydns', 'ipconfig /FlushDNS', 'help']) {
      expect(HostCommandLayer.handles(line)).toBe(true)
    }
    for (const line of ['ipconfig', 'ipconfig /all', 'ping 1.1.1.1', 'arp -d 10.0.0.1', 'ipconfig /displaydns x', '']) {
      expect(HostCommandLayer.handles(line)).toBe(false)
      expect(HostCommandLayer.run(pc(), env(pc()), line)).toBeNull()
    }
  })

  it('prints the engine messages for devices without a prompt and powered-off hosts', () => {
    expect(run(testRouter(), 'hostname')).toEqual(['{engine:noTerminal}'])
    expect(run({ ...pc(), powered: false }, 'netstat')).toEqual(['{engine:devicePoweredOff}'])
  })

  it('lists its commands in help', () => {
    const help = run(pc(), 'help')
    expect(help.indexOf('{hostCli:help.ipconfigDisplayDns}')).toBe(help.indexOf('{engine:help.ipconfigRelease}') + 1)
    expect(help.indexOf('{hostCli:help.ipconfigFlushDns}')).toBe(help.indexOf('{engine:help.ipconfigRelease}') + 2)
    expect(help.slice(-3)).toEqual(['{hostCli:help.netstat}', '{hostCli:help.hostname}', '{engine:help.help}'])
  })
})

describe('host command layer: hostname', () => {
  it('prints the computer name like ipconfig /all', () => {
    expect(run(pc(), 'hostname')).toEqual(['PC1'])
  })

  it('refuses to rename', () => {
    expect(run(pc(), 'hostname OFFICE')).toEqual(['sethostname: Use the Network Control Panel Applet to set hostname.'])
  })
})

describe('host command layer: netstat', () => {
  const header = ['', 'Active Connections', '', '  Proto  Local Address          Foreign Address        State']

  it('shows no connection on an idle host, and the listening sockets with -a', () => {
    expect(run(pc('dhcp'), 'netstat')).toEqual(header)
    expect(run(pc('dhcp'), 'netstat -a')).toEqual([...header, '  UDP    0.0.0.0:bootpc         *:*'])
    expect(run(pc('dhcp'), 'netstat -an')).toEqual([...header, '  UDP    0.0.0.0:68             *:*'])
    // The server's second NIC still uses DHCP.
    expect(run(dnsServer(), 'netstat /a /n')).toEqual([...header, '  UDP    0.0.0.0:53             *:*', '  UDP    0.0.0.0:68             *:*'])
  })

  it('shows the HTTP connections and DNS queries of the running simulation', () => {
    const device = pc()
    const runtime = runtimeOf(
      device,
      withSessions([
        { kind: 'httpClient', requestId: 'r1', serverIp: '142.250.187.206', host: 'google.com', path: '/', srcPort: 49153, state: 'requestSent', seq: 1 },
        { kind: 'httpClient', requestId: 'r2', serverIp: '192.168.1.80', host: 'intranet', path: '/', srcPort: 49155, state: 'synSent', seq: 1 },
        { kind: 'httpClient', requestId: 'r3', serverIp: '192.168.1.80', host: 'intranet', path: '/', srcPort: 49156, state: 'done', seq: 1 },
        { kind: 'dnsClient', requestId: 'r4', name: 'google.com', servers: ['192.168.1.2'], serverIndex: 0, queryId: 7, srcPort: 49154, sawNoDns: false },
      ]),
    )
    expect(run(device, 'netstat', env(device, runtime))).toEqual([
      ...header,
      '  TCP    192.168.1.10:49153     142.250.187.206:http   ESTABLISHED',
      '  TCP    192.168.1.10:49155     192.168.1.80:http      SYN_SENT',
    ])
    expect(run(device, 'netstat -na', env(device, runtime))).toEqual([
      ...header,
      '  TCP    192.168.1.10:49153     142.250.187.206:80     ESTABLISHED',
      '  TCP    192.168.1.10:49155     192.168.1.80:80        SYN_SENT',
      '  UDP    192.168.1.10:49154     *:*',
    ])
  })

  it('ignores a runtime of another device', () => {
    const device = pc()
    const other = runtimeOf(dnsServer(), withSessions([{ kind: 'dnsClient', requestId: 'r', name: 'a', servers: ['1.1.1.1'], serverIndex: 0, queryId: 1, srcPort: 49152, sawNoDns: false }]))
    expect(run(device, 'netstat -a', env(device, other))).toEqual(header)
  })

  it('prints the usage for an option the lab does not support', () => {
    expect(run(pc(), 'netstat -o')).toEqual([
      '',
      'Displays protocol statistics and current TCP/IP network connections.',
      '',
      'NETSTAT [-a] [-n]',
      '',
      '  -a            Displays all connections and listening ports.',
      '  -n            Displays addresses and port numbers in numerical form.',
      '',
    ])
  })
})

describe('host command layer: DNS cache', () => {
  it('shows the live entries of the resolver cache as Windows does', () => {
    const device = pc()
    const runtime = runtimeOf(device, (empty) => ({
      ...empty,
      services: {
        ...empty.services,
        dnsCache: [
          { name: 'google.com', address: '142.250.187.206', expiresAt: 3_600_000 },
          { name: 'old.local', address: '10.0.0.9', expiresAt: 1_000 },
          { name: 'missing.local', address: null, expiresAt: 900_000 },
        ],
      },
    }))
    expect(run(device, 'ipconfig /displaydns', env(device, runtime, 10_500))).toEqual([
      '',
      'Windows IP Configuration',
      '',
      '    google.com',
      '    ----------------------------------------',
      '    Record Name . . . . . : google.com',
      '    Record Type . . . . . : 1',
      '    Time To Live  . . . . : 3590',
      '    Data Length . . . . . : 4',
      '    Section . . . . . . . : Answer',
      '    A (Host) Record . . . : 142.250.187.206',
      '',
      '',
      '    missing.local',
      '    ----------------------------------------',
      '    Name does not exist.',
      '',
      '',
    ])
  })

  it('shows only the title without a cache or a simulation', () => {
    expect(run(pc(), 'ipconfig /displaydns')).toEqual(['', 'Windows IP Configuration', ''])
  })

  it('flushes the cache through a clearTable request', () => {
    const result = HostCommandLayer.run(pc(), env(pc()), 'ipconfig /flushdns')
    expect(result?.request).toEqual({ kind: 'clearTable', deviceId: 'pc1', table: 'dnsCache' })
    expect(textOf(result?.lines ?? [])).toEqual(['', 'Windows IP Configuration', '', 'Successfully flushed the DNS Resolver Cache.'])
  })
})
