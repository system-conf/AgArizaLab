import { describe, expect, it } from 'vitest'
import type { CommandResult } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import { CommandFormatter } from './CommandFormatter'
import { CommandRunner } from './CommandRunner'
import { DhcpService } from './DhcpService'
import { DnsResolver } from './DnsResolver'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'
import { deviceOf, officeNetwork, updateDevice, updateHost, updateLink, vlanNetwork } from './testFixtures'

const segments = new SegmentFinder()
const reachability = new ReachabilityChecker(segments)
const runner = new CommandRunner({
  segments,
  reachability,
  dns: new DnsResolver(reachability),
  dhcp: new DhcpService(segments),
  formatter: new CommandFormatter(),
})

function run(state: NetworkState, deviceId: string, line: string): CommandResult {
  return runner.run(state, deviceId, line)
}

function textOf(result: CommandResult): string {
  return result.lines.map((line) => line.text).join('\n')
}

describe('CommandRunner — ipconfig', () => {
  it('prints address, mask and gateway', () => {
    const output = textOf(run(officeNetwork(), 'pc1', 'ipconfig'))
    expect(output).toContain('Windows IP Configuration')
    expect(output).toContain('Ethernet adapter Ethernet:')
    expect(output).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.20')
    expect(output).toContain('   Subnet Mask . . . . . . . . . . . : 255.255.255.0')
    expect(output).toContain('   Default Gateway . . . . . . . . . : 192.168.1.1')
    expect(output).not.toContain('Physical Address')
  })

  it('shows Media disconnected for an unplugged cable', () => {
    const state = updateLink(officeNetwork(), 'pc1Link', { connected: false })
    const output = textOf(run(state, 'pc1', 'ipconfig'))
    expect(output).toContain('Media State . . . . . . . . . . . : Media disconnected')
    expect(output).not.toContain('IPv4 Address')
  })

  it('names the Wi-Fi adapter for wireless clients', () => {
    expect(textOf(run(vlanNetwork(), 'phone', 'ipconfig'))).toContain('Wireless LAN adapter Wi-Fi:')
  })

  it('shows an APIPA address for a DHCP host without a lease', () => {
    const state = updateHost(officeNetwork(), 'pc2', { ip: '', gateway: '' })
    expect(textOf(run(state, 'pc2', 'ipconfig'))).toContain('Autoconfiguration IPv4 Address. . : 169.254.')
  })

  it('adds MAC, DHCP and DNS details with /all', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: ['8.8.8.8', '1.1.1.1'] })
    const pc1 = deviceOf(state, 'pc1')
    const output = textOf(run(state, 'pc1', 'IPCONFIG /ALL'))
    expect(output).toContain('   Host Name . . . . . . . . . . . . : PC1')
    expect(output).toContain(`   Physical Address. . . . . . . . . : ${pc1.mac.replaceAll(':', '-')}`)
    expect(output).toContain('   DHCP Enabled. . . . . . . . . . . : No')
    expect(output).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.20(Preferred)')
    expect(output).toContain('   DNS Servers . . . . . . . . . . . : 8.8.8.8\n                                       1.1.1.1')
  })

  it('renews a DHCP lease and returns the next state', () => {
    const state = updateHost(officeNetwork(), 'pc2', { ip: '', gateway: '', dns: [] })
    const result = run(state, 'pc2', 'ipconfig /renew')
    expect(result.nextState).toBeDefined()
    expect(result.nextState && deviceOf(result.nextState, 'pc2').host?.ip).toBe('192.168.1.101')
    expect(textOf(result)).toContain('IPv4 Address. . . . . . . . . . . : 192.168.1.101')
  })

  it('reports a DHCP timeout without changing the state', () => {
    const state = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, dhcpPools: [] }))
    const result = run(state, 'pc2', 'ipconfig /renew')
    expect(result.nextState).toBeUndefined()
    expect(textOf(result)).toContain('unable to contact your DHCP server. Request has timed out.')
  })

  it('refuses /renew on a static host', () => {
    const result = run(officeNetwork(), 'pc1', 'ipconfig /renew')
    expect(result.nextState).toBeUndefined()
    expect(textOf(result)).toContain('no adapter is in the state permissible')
  })
})

describe('CommandRunner — ping', () => {
  it('prints four replies and statistics on success', () => {
    const output = textOf(run(officeNetwork(), 'pc1', 'ping 192.168.1.150'))
    expect(output).toContain('Pinging 192.168.1.150 with 32 bytes of data:')
    expect(output.match(/Reply from 192\.168\.1\.150: bytes=32 time=\d+ms TTL=128/g)).toHaveLength(4)
    expect(output).toContain('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),')
    expect(output).toContain('Minimum = 1ms, Maximum = 3ms, Average = 2ms')
  })

  it('resolves a name before pinging it', () => {
    const output = textOf(run(officeNetwork(), 'pc1', 'ping google.com'))
    expect(output).toContain('Pinging google.com [142.250.187.206] with 32 bytes of data:')
    expect(output).toContain('Reply from 142.250.187.206: bytes=32')
  })

  it('times out when the WAN is down', () => {
    const state = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, wanUp: false }))
    const output = textOf(run(state, 'pc1', 'ping 8.8.8.8'))
    expect(output.match(/Request timed out\./g)).toHaveLength(4)
    expect(output).toContain('Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),')
    expect(output).not.toContain('Approximate round trip times')
  })

  it('reports destination host unreachable from the gateway for routing failures', () => {
    const output = textOf(run(vlanNetwork(), 'kasa', 'ping 192.168.20.77'))
    expect(output.match(/Reply from 192\.168\.10\.1: Destination host unreachable\./g)).toHaveLength(4)
  })

  it('reports destination host unreachable from itself when ARP fails locally', () => {
    const output = textOf(run(officeNetwork(), 'pc1', 'ping 192.168.1.99'))
    expect(output).toContain('Reply from 192.168.1.20: Destination host unreachable.')
  })

  it('reports a general failure without a cable', () => {
    const state = updateLink(officeNetwork(), 'pc1Link', { connected: false })
    expect(textOf(run(state, 'pc1', 'ping 192.168.1.1'))).toContain('PING: transmit failed. General failure.')
  })

  it('cannot find a host name that does not resolve', () => {
    expect(textOf(run(officeNetwork(), 'pc1', 'ping yok.example'))).toBe(
      'Ping request could not find host yok.example. Please check the name and try again.',
    )
  })

  it('asks for a target when none is given', () => {
    expect(run(officeNetwork(), 'pc1', 'ping').lines[0]).toMatchObject({ kind: 'error' })
  })
})

describe('CommandRunner — nslookup', () => {
  it('prints the server and the answer', () => {
    const output = textOf(run(officeNetwork(), 'pc1', 'nslookup google.com'))
    expect(output).toBe(
      ['Server:  dns.google', 'Address:  8.8.8.8', '', 'Non-authoritative answer:', 'Name:    google.com', 'Address:  142.250.187.206'].join('\n'),
    )
  })

  it('reports a non-existent domain', () => {
    expect(textOf(run(officeNetwork(), 'pc1', 'nslookup yok.example'))).toContain(
      "*** dns.google can't find yok.example: Non-existent domain",
    )
  })

  it('reports a timeout when the DNS server is unreachable', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: ['192.168.1.254'] })
    const output = textOf(run(state, 'pc1', 'nslookup google.com'))
    expect(output).toContain('DNS request timed out.')
    expect(output).toContain('Address:  192.168.1.254')
  })

  it('reports missing DNS servers', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: [] })
    expect(textOf(run(state, 'pc1', 'nslookup google.com'))).toContain('*** Default servers are not available')
  })
})

describe('CommandRunner — other commands', () => {
  it('lists commands in Turkish for help', () => {
    const result = run(officeNetwork(), 'pc1', 'help')
    expect(result.lines[0]).toEqual({ kind: 'info', text: 'Kullanılabilir komutlar:' })
    expect(textOf(result)).toContain('ipconfig /renew')
  })

  it('rejects unknown commands with a Turkish error', () => {
    expect(run(officeNetwork(), 'pc1', 'tracert 8.8.8.8').lines).toEqual([
      { kind: 'error', text: "'tracert' komutu tanınmadı. Kullanılabilir komutları görmek için 'help' yazın." },
    ])
  })

  it('returns nothing for an empty line', () => {
    expect(run(officeNetwork(), 'pc1', '   ')).toEqual({ lines: [] })
  })

  it('refuses to run on a powered-off device or a device without a terminal', () => {
    const off = updateDevice(officeNetwork(), 'pc1', (device) => ({ ...device, powered: false }))
    expect(run(off, 'pc1', 'ipconfig').lines[0]).toMatchObject({ kind: 'error' })
    expect(run(officeNetwork(), 'switch', 'ipconfig').lines[0]).toMatchObject({ kind: 'error' })
  })

  it('is deterministic', () => {
    expect(run(officeNetwork(), 'pc1', 'ping google.com')).toEqual(run(officeNetwork(), 'pc1', 'ping google.com'))
  })
})
