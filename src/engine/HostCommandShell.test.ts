import { describe, expect, it } from 'vitest'
import type { CommandResult, DeviceKind, Ipv4Settings, NetworkState } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { editDevice, editHost, labDevice, textOf } from './testLabs'
import { editNic, editRouterServices, officeLab, powerOff, unplug, vlanLab, wanDown } from './testNetworks'

const engine = new DefaultNetworkEngine()

function run(state: NetworkState, deviceId: string, line: string): CommandResult {
  return engine.runCommand(state, deviceId, line)
}

function output(result: CommandResult): string {
  return textOf(result.lines).join('\n')
}

/** Turns a device into another kind (and the matching catalog model), keeping its ports and settings. */
function rekind(state: NetworkState, deviceId: string, kind: DeviceKind, modelId: string): NetworkState {
  return editDevice(state, deviceId, (device) => ({ ...device, kind, modelId }))
}

/** The IPv4 settings of a host's first NIC. */
function nicIpv4(state: NetworkState, deviceId: string): Ipv4Settings {
  const nic = labDevice(state, deviceId).ports[0]
  if (nic?.role !== 'host') throw new Error(`${deviceId} has no host NIC`)
  return nic.l3.ipv4
}

/** The MAC of a host's first NIC as ipconfig /all prints it. */
function physicalAddress(state: NetworkState, deviceId: string): string {
  const mac = labDevice(state, deviceId).ports[0]?.mac
  if (mac === undefined) throw new Error(`${deviceId} has no MAC`)
  return mac.toUpperCase().replaceAll(':', '-')
}

describe('host command shell — ipconfig', () => {
  it('prints address, mask and gateway', () => {
    const text = output(run(officeLab(), 'pc1', 'ipconfig'))
    expect(text).toContain('Windows IP Configuration')
    expect(text).toContain('Ethernet adapter Ethernet:')
    expect(text).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.20')
    expect(text).toContain('   Subnet Mask . . . . . . . . . . . : 255.255.255.0')
    expect(text).toContain('   Default Gateway . . . . . . . . . : 192.168.1.1')
    expect(text).not.toContain('Physical Address')
  })

  it('shows Media disconnected for an unplugged cable', () => {
    const text = output(run(unplug(officeLab(), 'pc1Link'), 'pc1', 'ipconfig'))
    expect(text).toContain('Media State . . . . . . . . . . . : Media disconnected')
    expect(text).not.toContain('IPv4 Address')
  })

  it('names the Wi-Fi adapter for wireless clients', () => {
    // A Wi-Fi laptop: the lab's phone turned into a PC, since phones have no terminal.
    const state = rekind(vlanLab(), 'phone', 'pc', 'pc')
    expect(output(run(state, 'phone', 'ipconfig'))).toContain('Wireless LAN adapter Wi-Fi:')
  })

  it('shows an APIPA address for a DHCP host without a lease', () => {
    const state = editHost(editNic(officeLab(), 'pc2', { address: '' }), 'pc2', { defaultGateway: '' })
    expect(output(run(state, 'pc2', 'ipconfig'))).toContain('Autoconfiguration IPv4 Address. . : 169.254.')
  })

  it('adds MAC, DHCP and DNS details with /all', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: ['8.8.8.8', '1.1.1.1'] })
    const text = output(run(state, 'pc1', 'IPCONFIG /ALL'))
    expect(text).toContain('   Host Name . . . . . . . . . . . . : PC1')
    expect(text).toContain(`   Physical Address. . . . . . . . . : ${physicalAddress(state, 'pc1')}`)
    expect(text).toContain('   DHCP Enabled. . . . . . . . . . . : No')
    expect(text).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.20(Preferred)')
    expect(text).toContain('   DNS Servers . . . . . . . . . . . : 8.8.8.8\n                                       1.1.1.1')
  })

  it('renews a DHCP lease and returns the next state', () => {
    const state = editHost(editNic(officeLab(), 'pc2', { address: '' }), 'pc2', { defaultGateway: '', dnsServers: [] })
    const result = run(state, 'pc2', 'ipconfig /renew')
    expect(result.nextState).toBeDefined()
    expect(result.nextState && nicIpv4(result.nextState, 'pc2').address).toBe('192.168.1.101')
    expect(output(result)).toContain('IPv4 Address. . . . . . . . . . . : 192.168.1.101')
  })

  it('reports a DHCP timeout without changing the state', () => {
    const state = editRouterServices(officeLab(), (services) => ({ ...services, dhcp: services.dhcp && { ...services.dhcp, pools: [] } }))
    const result = run(state, 'pc2', 'ipconfig /renew')
    expect(result.nextState).toBeUndefined()
    expect(output(result)).toContain('unable to contact your DHCP server. Request has timed out.')
  })

  it('refuses /renew on a static host', () => {
    const result = run(officeLab(), 'pc1', 'ipconfig /renew')
    expect(result.nextState).toBeUndefined()
    expect(output(result)).toContain('no adapter is in the state permissible')
  })
})

describe('host command shell — ping', () => {
  it('prints four replies and statistics on success', () => {
    const text = output(run(officeLab(), 'pc1', 'ping 192.168.1.150'))
    expect(text).toContain('Pinging 192.168.1.150 with 32 bytes of data:')
    expect(text.match(/Reply from 192\.168\.1\.150: bytes=32 time=\d+ms TTL=128/g)).toHaveLength(4)
    expect(text).toContain('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),')
    expect(text).toContain('Minimum = 1ms, Maximum = 3ms, Average = 2ms')
  })

  it('resolves a name before pinging it', () => {
    const text = output(run(officeLab(), 'pc1', 'ping google.com'))
    expect(text).toContain('Pinging google.com [142.250.187.206] with 32 bytes of data:')
    expect(text).toContain('Reply from 142.250.187.206: bytes=32')
  })

  it('times out when the WAN is down', () => {
    const text = output(run(wanDown(officeLab()), 'pc1', 'ping 8.8.8.8'))
    expect(text.match(/Request timed out\./g)).toHaveLength(4)
    expect(text).toContain('Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),')
    expect(text).not.toContain('Approximate round trip times')
  })

  it('reports destination host unreachable from the gateway for routing failures', () => {
    const text = output(run(vlanLab(), 'kasa', 'ping 192.168.20.77'))
    expect(text.match(/Reply from 192\.168\.10\.1: Destination host unreachable\./g)).toHaveLength(4)
  })

  it('reports destination host unreachable from itself when ARP fails locally', () => {
    expect(output(run(officeLab(), 'pc1', 'ping 192.168.1.99'))).toContain('Reply from 192.168.1.20: Destination host unreachable.')
  })

  it('reports a general failure without a cable', () => {
    expect(output(run(unplug(officeLab(), 'pc1Link'), 'pc1', 'ping 192.168.1.1'))).toContain('PING: transmit failed. General failure.')
  })

  it('cannot find a host name that does not resolve', () => {
    expect(output(run(officeLab(), 'pc1', 'ping yok.example'))).toBe(
      'Ping request could not find host yok.example. Please check the name and try again.',
    )
  })

  it('asks for a target when none is given', () => {
    expect(run(officeLab(), 'pc1', 'ping').lines[0]).toMatchObject({ kind: 'error' })
  })
})

describe('host command shell — nslookup', () => {
  it('prints the server and the answer', () => {
    expect(output(run(officeLab(), 'pc1', 'nslookup google.com'))).toBe(
      ['Server:  dns.google', 'Address:  8.8.8.8', '', 'Non-authoritative answer:', 'Name:    google.com', 'Address:  142.250.187.206'].join('\n'),
    )
  })

  it('reports a non-existent domain', () => {
    expect(output(run(officeLab(), 'pc1', 'nslookup yok.example'))).toContain("*** dns.google can't find yok.example: Non-existent domain")
  })

  it('reports a timeout when the DNS server is unreachable', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: ['192.168.1.254'] })
    const text = output(run(state, 'pc1', 'nslookup google.com'))
    expect(text).toContain('DNS request timed out.')
    expect(text).toContain('Address:  192.168.1.254')
  })

  it('reports missing DNS servers', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: [] })
    expect(output(run(state, 'pc1', 'nslookup google.com'))).toContain('*** Default servers are not available')
  })
})

describe('host command shell — other commands', () => {
  it('lists commands as translated messages for help', () => {
    const result = run(officeLab(), 'pc1', 'help')
    expect(result.lines[0]).toEqual({ kind: 'info', message: { key: 'engine:help.title' } })
    expect(result.lines.map((line) => line.message?.key)).toContain('engine:help.tracert')
  })

  it('rejects unknown commands like cmd.exe, plus a translated hint', () => {
    expect(run(officeLab(), 'pc1', 'Foo bar').lines).toEqual([
      { kind: 'error', text: "'Foo' is not recognized as an internal or external command," },
      { kind: 'error', text: 'operable program or batch file.' },
      { kind: 'info', message: { key: 'engine:unknownCommand', params: { command: 'Foo' } } },
    ])
  })

  it('returns nothing for an empty line', () => {
    expect(run(officeLab(), 'pc1', '   ')).toEqual({ lines: [] })
  })

  it('refuses to run on a powered-off device or a device without a terminal', () => {
    const off = powerOff(officeLab(), 'pc1')
    expect(run(off, 'pc1', 'ipconfig').lines).toEqual([{ kind: 'error', message: { key: 'engine:devicePoweredOff' } }])
    expect(run(off, 'pc1', 'foo').lines).toEqual([{ kind: 'error', message: { key: 'engine:devicePoweredOff' } }])
    expect(run(officeLab(), 'switch', 'ipconfig').lines[0]).toMatchObject({ kind: 'error' })
  })

  it('offers a terminal only on PCs, POS terminals and NVRs', () => {
    const noTerminal = { kind: 'error', message: { key: 'engine:noTerminal' } }
    expect(run(officeLab(), 'printer', 'ipconfig').lines).toEqual([noTerminal])
    expect(run(vlanLab(), 'kitchen', 'ping 192.168.10.20').lines).toEqual([noTerminal])
    expect(run(vlanLab(), 'phone', 'nslookup google.com').lines).toEqual([noTerminal])
    expect(run(vlanLab(), 'phone', 'tracert 8.8.8.8').lines).toEqual([noTerminal])
    const camera = rekind(officeLab(), 'printer', 'camera', 'ipCamera')
    expect(run(camera, 'printer', 'ipconfig').lines).toEqual([noTerminal])

    expect(output(run(vlanLab(), 'kasa', 'ipconfig'))).toContain('IPv4 Address')
    const nvr = rekind(officeLab(), 'printer', 'nvr', 'nvr')
    expect(output(run(nvr, 'printer', 'ping 192.168.1.20'))).toContain('Reply from 192.168.1.20')
  })

  it('is deterministic', () => {
    expect(run(officeLab(), 'pc1', 'ping google.com')).toEqual(run(officeLab(), 'pc1', 'ping google.com'))
  })
})

describe('host command shell — ipconfig /release and options', () => {
  it('releases a DHCP address and returns the next state', () => {
    const result = run(officeLab(), 'pc2', 'ipconfig /release')
    expect(result.nextState && nicIpv4(result.nextState, 'pc2')).toEqual({ addressing: 'dhcp', address: '', mask: '' })
    expect(result.nextState && labDevice(result.nextState, 'pc2').host).toMatchObject({ defaultGateway: '', dnsServers: [] })
    const text = output(result)
    expect(text).toContain('Ethernet adapter Ethernet:')
    expect(text).toContain('   Default Gateway . . . . . . . . . : ')
    expect(text).not.toContain('IPv4 Address')
  })

  it('gets the same address back on the next renew', () => {
    const released = run(officeLab(), 'pc2', 'ipconfig /release').nextState
    if (!released) throw new Error('release returned no state')
    const renewed = run(released, 'pc2', 'ipconfig /renew').nextState
    expect(renewed && nicIpv4(renewed, 'pc2').address).toBe('192.168.1.101')
  })

  it('refuses /release on a static host and without a link', () => {
    const staticResult = run(officeLab(), 'pc1', 'ipconfig /release')
    expect(staticResult.nextState).toBeUndefined()
    expect(output(staticResult)).toContain('no adapter is in the state permissible')

    const unplugged = unplug(officeLab(), 'pc2Link')
    for (const line of ['ipconfig /release', 'ipconfig /renew']) {
      const result = run(unplugged, 'pc2', line)
      expect(result.nextState).toBeUndefined()
      expect(output(result)).toContain('No operation can be performed on Ethernet while it has its media disconnected.')
    }
  })

  it('rejects an unknown ipconfig option with the Windows error and a usage hint', () => {
    expect(run(officeLab(), 'pc1', 'ipconfig /flush').lines).toEqual([
      { kind: 'error', text: 'Error: unrecognized or incomplete command line.' },
      { kind: 'error', message: { key: 'engine:usage.ipconfig' } },
    ])
  })

  it('shows a duplicate address as unusable', () => {
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    const text = output(run(state, 'pc1', 'ipconfig'))
    expect(text).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.20(Duplicate)')
    expect(text).toContain('   Autoconfiguration IPv4 Address. . : 169.254.')
    expect(output(run(officeLab(), 'pc1', 'ipconfig'))).not.toContain('Duplicate')
  })
})

describe('host command shell — ping options', () => {
  it('sends the requested number of requests with the requested size', () => {
    const text = output(run(officeLab(), 'pc1', 'ping -n 2 192.168.1.150 -L 1000'))
    expect(text).toContain('Pinging 192.168.1.150 with 1000 bytes of data:')
    expect(text.match(/Reply from 192\.168\.1\.150: bytes=1000 time=\d+ms TTL=128/g)).toHaveLength(2)
    expect(text).toContain('Packets: Sent = 2, Received = 2, Lost = 0 (0% loss),')
  })

  it('shows at most 20 requests, with a note', () => {
    const result = run(officeLab(), 'pc1', 'ping -n 500 8.8.8.8')
    expect(result.lines[0]).toEqual({ kind: 'info', message: { key: 'engine:pingCountLimited', params: { count: 20 } } })
    expect(result.lines.filter((line) => line.message !== undefined)).toHaveLength(1)
    const text = output(result)
    expect(text.match(/Reply from 8\.8\.8\.8/g)).toHaveLength(20)
    expect(text).toContain('Packets: Sent = 20, Received = 20, Lost = 0 (0% loss),')
  })

  it('adds no note for 20 requests or fewer', () => {
    expect(run(officeLab(), 'pc1', 'ping -n 20 8.8.8.8').lines.filter((line) => line.message !== undefined)).toEqual([])
  })

  it('answers -t with four requests and a note', () => {
    const result = run(officeLab(), 'pc1', 'ping -t -4 8.8.8.8')
    expect(result.lines[0]).toEqual({ kind: 'info', message: { key: 'engine:pingContinuousNotSupported' } })
    expect(output(result).match(/Reply from 8\.8\.8\.8/g)).toHaveLength(4)
    expect(result.trace?.ok).toBe(true)
  })

  it('rejects bad options and values without sending anything', () => {
    const badOption = run(officeLab(), 'pc1', 'ping -x 8.8.8.8')
    expect(badOption.lines).toEqual([
      { kind: 'error', text: 'Bad option -x.' },
      { kind: 'error', message: { key: 'engine:usage.ping' } },
    ])
    expect(badOption.trace).toBeUndefined()
    expect(run(officeLab(), 'pc1', 'ping -l 70000 8.8.8.8').lines).toEqual([
      { kind: 'error', text: 'Bad value for option -l, valid range is from 0 to 65500.' },
    ])
    expect(run(officeLab(), 'pc1', 'ping -n').lines[0]).toEqual({ kind: 'error', text: 'Value must be supplied for option -n.' })
    expect(run(officeLab(), 'pc1', 'ping').lines).toEqual([{ kind: 'error', message: { key: 'engine:usage.ping' } }])
  })

  it('fails at the source when the own address is duplicate or not a host address', () => {
    const conflict = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    const conflictResult = run(conflict, 'pc1', 'ping 192.168.1.1')
    expect(output(conflictResult).match(/PING: transmit failed\. General failure\./g)).toHaveLength(4)
    expect(conflictResult.trace).toEqual({ ok: false, path: ['pc1'] })

    const broadcast = editNic(officeLab(), 'pc1', { address: '192.168.1.255' })
    expect(output(run(broadcast, 'pc1', 'ping 192.168.1.1'))).toContain('PING: transmit failed. General failure.')
  })

  it('gets no answer from a duplicate address', () => {
    const conflict = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    expect(output(run(conflict, 'pc2', 'ping 192.168.1.20'))).toContain('Reply from 192.168.1.101: Destination host unreachable.')
  })
})
