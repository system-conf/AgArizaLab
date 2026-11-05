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
    // A Wi-Fi laptop: the fixture's phone turned into a PC, since phones have no terminal.
    const state = updateDevice(vlanNetwork(), 'phone', (device) => ({ ...device, kind: 'pc' }))
    expect(textOf(run(state, 'phone', 'ipconfig'))).toContain('Wireless LAN adapter Wi-Fi:')
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
  it('lists commands as translated messages for help', () => {
    const result = run(officeNetwork(), 'pc1', 'help')
    expect(result.lines[0]).toEqual({ kind: 'info', message: { key: 'engine:help.title' } })
    expect(result.lines.map((line) => line.message?.key)).toContain('engine:help.tracert')
  })

  it('rejects unknown commands like cmd.exe, plus a translated hint', () => {
    expect(run(officeNetwork(), 'pc1', 'Foo bar').lines).toEqual([
      { kind: 'error', text: "'Foo' is not recognized as an internal or external command," },
      { kind: 'error', text: 'operable program or batch file.' },
      { kind: 'info', message: { key: 'engine:unknownCommand', params: { command: 'Foo' } } },
    ])
  })

  it('returns nothing for an empty line', () => {
    expect(run(officeNetwork(), 'pc1', '   ')).toEqual({ lines: [] })
  })

  it('refuses to run on a powered-off device or a device without a terminal', () => {
    const off = updateDevice(officeNetwork(), 'pc1', (device) => ({ ...device, powered: false }))
    expect(run(off, 'pc1', 'ipconfig').lines).toEqual([{ kind: 'error', message: { key: 'engine:devicePoweredOff' } }])
    expect(run(off, 'pc1', 'foo').lines).toEqual([{ kind: 'error', message: { key: 'engine:devicePoweredOff' } }])
    expect(run(officeNetwork(), 'switch', 'ipconfig').lines[0]).toMatchObject({ kind: 'error' })
  })

  it('offers a terminal only on PCs, POS terminals and NVRs', () => {
    const noTerminal = { kind: 'error', message: { key: 'engine:noTerminal' } }
    expect(run(officeNetwork(), 'printer', 'ipconfig').lines).toEqual([noTerminal])
    expect(run(vlanNetwork(), 'kitchen', 'ping 192.168.10.20').lines).toEqual([noTerminal])
    expect(run(vlanNetwork(), 'phone', 'nslookup google.com').lines).toEqual([noTerminal])
    expect(run(vlanNetwork(), 'phone', 'tracert 8.8.8.8').lines).toEqual([noTerminal])
    const camera = updateDevice(officeNetwork(), 'printer', (device) => ({ ...device, kind: 'camera' }))
    expect(run(camera, 'printer', 'ipconfig').lines).toEqual([noTerminal])

    expect(textOf(run(vlanNetwork(), 'kasa', 'ipconfig'))).toContain('IPv4 Address')
    const nvr = updateDevice(officeNetwork(), 'printer', (device) => ({ ...device, kind: 'nvr' }))
    expect(textOf(run(nvr, 'printer', 'ping 192.168.1.20'))).toContain('Reply from 192.168.1.20')
  })

  it('is deterministic', () => {
    expect(run(officeNetwork(), 'pc1', 'ping google.com')).toEqual(run(officeNetwork(), 'pc1', 'ping google.com'))
  })
})

describe('CommandRunner — ipconfig /release and options', () => {
  it('releases a DHCP address and returns the next state', () => {
    const result = run(officeNetwork(), 'pc2', 'ipconfig /release')
    expect(result.nextState && deviceOf(result.nextState, 'pc2').host).toEqual({ mode: 'dhcp', ip: '', mask: '', gateway: '', dns: [] })
    const output = textOf(result)
    expect(output).toContain('Ethernet adapter Ethernet:')
    expect(output).toContain('   Default Gateway . . . . . . . . . : ')
    expect(output).not.toContain('IPv4 Address')
  })

  it('gets the same address back on the next renew', () => {
    const released = run(officeNetwork(), 'pc2', 'ipconfig /release').nextState
    if (!released) throw new Error('release returned no state')
    const renewed = run(released, 'pc2', 'ipconfig /renew').nextState
    expect(renewed && deviceOf(renewed, 'pc2').host?.ip).toBe('192.168.1.101')
  })

  it('refuses /release on a static host and without a link', () => {
    const staticResult = run(officeNetwork(), 'pc1', 'ipconfig /release')
    expect(staticResult.nextState).toBeUndefined()
    expect(textOf(staticResult)).toContain('no adapter is in the state permissible')

    const unplugged = updateLink(officeNetwork(), 'pc2Link', { connected: false })
    for (const line of ['ipconfig /release', 'ipconfig /renew']) {
      const result = run(unplugged, 'pc2', line)
      expect(result.nextState).toBeUndefined()
      expect(textOf(result)).toContain('No operation can be performed on Ethernet while it has its media disconnected.')
    }
  })

  it('rejects an unknown ipconfig option with the Windows error and a usage hint', () => {
    expect(run(officeNetwork(), 'pc1', 'ipconfig /flush').lines).toEqual([
      { kind: 'error', text: 'Error: unrecognized or incomplete command line.' },
      { kind: 'error', message: { key: 'engine:usage.ipconfig' } },
    ])
  })

  it('shows a duplicate address as unusable', () => {
    const state = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.20' })
    const output = textOf(run(state, 'pc1', 'ipconfig'))
    expect(output).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.20(Duplicate)')
    expect(output).toContain('   Autoconfiguration IPv4 Address. . : 169.254.')
    expect(textOf(run(officeNetwork(), 'pc1', 'ipconfig'))).not.toContain('Duplicate')
  })
})

describe('CommandRunner — ping options', () => {
  it('sends the requested number of requests with the requested size', () => {
    const output = textOf(run(officeNetwork(), 'pc1', 'ping -n 2 192.168.1.150 -L 1000'))
    expect(output).toContain('Pinging 192.168.1.150 with 1000 bytes of data:')
    expect(output.match(/Reply from 192\.168\.1\.150: bytes=1000 time=\d+ms TTL=128/g)).toHaveLength(2)
    expect(output).toContain('Packets: Sent = 2, Received = 2, Lost = 0 (0% loss),')
  })

  it('shows at most 20 requests, with a note', () => {
    const result = run(officeNetwork(), 'pc1', 'ping -n 500 8.8.8.8')
    expect(result.lines[0]).toEqual({ kind: 'info', message: { key: 'engine:pingCountLimited', params: { count: 20 } } })
    expect(result.lines.filter((line) => line.message !== undefined)).toHaveLength(1)
    const output = textOf(result)
    expect(output.match(/Reply from 8\.8\.8\.8/g)).toHaveLength(20)
    expect(output).toContain('Packets: Sent = 20, Received = 20, Lost = 0 (0% loss),')
  })

  it('adds no note for 20 requests or fewer', () => {
    expect(run(officeNetwork(), 'pc1', 'ping -n 20 8.8.8.8').lines.filter((line) => line.message !== undefined)).toEqual([])
  })

  it('answers -t with four requests and a note', () => {
    const result = run(officeNetwork(), 'pc1', 'ping -t -4 8.8.8.8')
    expect(result.lines[0]).toEqual({ kind: 'info', message: { key: 'engine:pingContinuousNotSupported' } })
    expect(textOf(result).match(/Reply from 8\.8\.8\.8/g)).toHaveLength(4)
    expect(result.trace?.ok).toBe(true)
  })

  it('rejects bad options and values without sending anything', () => {
    const badOption = run(officeNetwork(), 'pc1', 'ping -x 8.8.8.8')
    expect(badOption.lines).toEqual([
      { kind: 'error', text: 'Bad option -x.' },
      { kind: 'error', message: { key: 'engine:usage.ping' } },
    ])
    expect(badOption.trace).toBeUndefined()
    expect(run(officeNetwork(), 'pc1', 'ping -l 70000 8.8.8.8').lines).toEqual([
      { kind: 'error', text: 'Bad value for option -l, valid range is from 0 to 65500.' },
    ])
    expect(run(officeNetwork(), 'pc1', 'ping -n').lines[0]).toEqual({ kind: 'error', text: 'Value must be supplied for option -n.' })
    expect(run(officeNetwork(), 'pc1', 'ping').lines).toEqual([{ kind: 'error', message: { key: 'engine:usage.ping' } }])
  })

  it('fails at the source when the own address is duplicate or not a host address', () => {
    const conflict = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.20' })
    const conflictResult = run(conflict, 'pc1', 'ping 192.168.1.1')
    expect(textOf(conflictResult).match(/PING: transmit failed\. General failure\./g)).toHaveLength(4)
    expect(conflictResult.trace).toEqual({ ok: false, path: ['pc1'] })

    const broadcast = updateHost(officeNetwork(), 'pc1', { ip: '192.168.1.255' })
    expect(textOf(run(broadcast, 'pc1', 'ping 192.168.1.1'))).toContain('PING: transmit failed. General failure.')
  })

  it('gets no answer from a duplicate address', () => {
    const conflict = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.20' })
    expect(textOf(run(conflict, 'pc2', 'ping 192.168.1.20'))).toContain('Reply from 192.168.1.101: Destination host unreachable.')
  })
})
