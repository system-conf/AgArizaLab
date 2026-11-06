import { describe, expect, it } from 'vitest'
import type { EchoResult, RequestResult, SimRequest } from '../../sim/contract'
import { PingTally } from '../../sim/contract'
import { finished, RouterCli } from './testRouterCli'

function reply(sequence: number, rttMs: number): EchoResult {
  return { kind: 'reply', sequence, requestPduId: `p${sequence}`, fromIp: '192.168.1.20', ttl: 128, bytes: 72, rttMs }
}

function timeout(sequence: number): EchoResult {
  return { kind: 'timeout', sequence, requestPduId: `p${sequence}` }
}

function jobOf(cli: RouterCli): SimRequest {
  const job = cli.last.job
  if (job === undefined) throw new Error('no job')
  return job
}

function done(cli: RouterCli, result: RequestResult | null): string[] {
  return cli.finish(finished('r1', jobOf(cli), result))
}

describe('router CLI: ping', () => {
  it('sends a ping job and prints the IOS marks and success rate', () => {
    const cli = new RouterCli()
    expect(cli.type('ping 192.168.1.20')).toEqual([
      'Type escape sequence to abort.',
      'Sending 5, 100-byte ICMP Echos to 192.168.1.20, timeout is 2 seconds:',
    ])
    expect(cli.last.input).toBe('busy')
    expect(jobOf(cli)).toEqual({ kind: 'ping', deviceId: 'r1', targetIp: '192.168.1.20', count: 5, size: 72 })
    expect(done(cli, PingTally.of([timeout(0), reply(1, 1), reply(2, 0), reply(3, 2), reply(4, 1)]))).toEqual([
      '.!!!!',
      'Success rate is 80 percent (4/5), round-trip min/avg/max = 0/1/2 ms',
    ])
    expect(cli.prompt).toBe('Router>')
  })

  it('prints U for unreachable and only the rate when nothing answered', () => {
    const cli = new RouterCli()
    cli.type('enable')
    cli.type('ping 10.9.9.9 repeat 3 size 200')
    expect(jobOf(cli)).toEqual({ kind: 'ping', deviceId: 'r1', targetIp: '10.9.9.9', count: 3, size: 172 })
    const unreachable: EchoResult = { kind: 'unreachable', sequence: 0, requestPduId: 'p0', fromIp: '10.0.0.1', code: 'host' }
    expect(done(cli, PingTally.of([unreachable, timeout(1), { kind: 'localFailure', sequence: 2, reason: 'noRoute' }]))).toEqual([
      'U..',
      'Success rate is 0 percent (0/3)',
    ])
  })

  it('wraps long mark lines at 70 characters', () => {
    const cli = new RouterCli()
    cli.type('ping 10.0.0.2 repeat 100')
    const echoes = Array.from({ length: 100 }, (_, index) => reply(index, 1))
    const lines = done(cli, PingTally.of(echoes))
    expect(lines.map((line) => line.length)).toEqual([70, 30, 'Success rate is 100 percent (100/100), round-trip min/avg/max = 1/1/1 ms'.length])
  })

  it('runs from config mode with do', () => {
    const cli = new RouterCli()
    cli.configure()
    cli.type('do ping 10.0.0.2')
    expect(jobOf(cli).kind).toBe('ping')
    expect(done(cli, null)).toEqual(['Success rate is 0 percent (0/5)'])
    expect(cli.prompt).toBe('Router(config)#')
  })

  it('resolves names with ip host, the name servers, or fails like IOS', () => {
    const cli = new RouterCli()
    cli.type('enable')
    expect(cli.type('ping www.lab.local')).toEqual([
      'Translating "www.lab.local"...domain server (255.255.255.255)',
      '% Unrecognized host or address, or protocol not running.',
    ])
    expect(cli.type('ping 300.1.1.1')).toEqual(['% Unrecognized host or address, or protocol not running.'])
    cli.typeAll('configure terminal', 'ip host files 10.0.0.9', 'ip name-server 8.8.8.8', 'end')
    cli.type('ping files')
    expect(jobOf(cli)).toMatchObject({ kind: 'ping', targetIp: '10.0.0.9' })
    done(cli, null)
    expect(cli.type('ping www.lab.local')).toEqual(['Translating "www.lab.local"...domain server (8.8.8.8)'])
    expect(jobOf(cli)).toEqual({ kind: 'dnsQuery', deviceId: 'r1', name: 'www.lab.local', servers: ['8.8.8.8'], useCache: true })
    expect(done(cli, { kind: 'dns', name: 'www.lab.local', answer: { ok: true, ip: '192.168.1.50', dnsServer: '8.8.8.8' } })).toEqual([
      'Type escape sequence to abort.',
      'Sending 5, 100-byte ICMP Echos to 192.168.1.50, timeout is 2 seconds:',
    ])
    expect(jobOf(cli)).toMatchObject({ kind: 'ping', targetIp: '192.168.1.50' })
    done(cli, null)
    cli.type('ping nowhere')
    expect(done(cli, { kind: 'dns', name: 'nowhere', answer: { ok: false, reason: 'dnsNoAnswer' } })).toEqual([
      '% Unrecognized host or address, or protocol not running.',
    ])
    cli.typeAll('configure terminal', 'no ip domain-lookup', 'end')
    expect(cli.type('ping nowhere')).toEqual(['% Unrecognized host or address, or protocol not running.'])
  })
})

describe('router CLI: traceroute and clear arp-cache', () => {
  it('traces the route hop by hop', () => {
    const cli = new RouterCli()
    expect(cli.type('traceroute 10.0.2.2')).toEqual(['Type escape sequence to abort.', 'Tracing the route to 10.0.2.2', ''])
    expect(jobOf(cli)).toEqual({ kind: 'tracert', deviceId: 'r1', targetIp: '10.0.2.2', maxHops: 30, probesPerHop: 3, maxSilentHops: 4 })
    const output = done(cli, {
      kind: 'tracert',
      hops: [
        {
          ttl: 1,
          probes: [
            { kind: 'timeExceeded', fromIp: '10.0.1.2', rttMs: 0 },
            { kind: 'timeExceeded', fromIp: '10.0.1.2', rttMs: 1 },
            { kind: 'timeExceeded', fromIp: '10.0.1.2', rttMs: 0 },
          ],
        },
        { ttl: 2, probes: [{ kind: 'timeout' }, { kind: 'timeout' }, { kind: 'timeout' }] },
        {
          ttl: 3,
          probes: [
            { kind: 'timeout' },
            { kind: 'echoReply', fromIp: '10.0.2.2', rttMs: 2 },
            { kind: 'unreachable', fromIp: '10.0.2.2', rttMs: 1, code: 'host' },
          ],
        },
      ],
      ending: { kind: 'reached' },
    })
    expect(output).toEqual([
      '  1   10.0.1.2        0 msec    1 msec    0 msec',
      '  2   *    *    *',
      '  3   10.0.2.2        *    2 msec    !H',
    ])
  })

  it('clears the ARP cache through the simulator', () => {
    const cli = new RouterCli()
    cli.type('enable')
    expect(cli.type('clear arp-cache')).toEqual([])
    expect(jobOf(cli)).toEqual({ kind: 'clearTable', deviceId: 'r1', table: 'arp' })
    expect(done(cli, { kind: 'cleared', entries: 3 })).toEqual([])
    expect(cli.prompt).toBe('Router#')
  })
})
