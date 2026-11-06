// `ping`, `traceroute` and `clear arp-cache` from the device (docs/CLI.md §7): each returns a simulator job
// the UI runs; the output comes from the finished RequestRecord. Names are resolved with `ip host`, then
// the configured name servers (a dnsQuery job), like IOS with `ip domain-lookup`.
import { Ipv4 } from '../../net/Ipv4'
import { SIM_LIMITS } from '../../sim/contract'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError, cliText } from '../core/CliOutput'
import { managementOf } from '../core/CliPrompt'
import { ProbeViews } from './ProbeViews'
import { RouterEdits } from './RouterEdits'

const UNRECOGNIZED = '% Unrecognized host or address, or protocol not running.'
const ABORT_HINT = 'Type escape sequence to abort.'
const DEFAULT_COUNT = 5
const DEFAULT_SIZE = 100
/** IP (20) + ICMP (8) header bytes: IOS sizes are whole datagrams, the simulator counts data bytes. */
const HEADER_BYTES = 28
const MIN_SIZE = 36
const MAX_SIZE = 18024
const TRACE_MAX_HOPS = 30
const TRACE_PROBES = 3
/** Lab limit: stop after this many silent hops in a row (IOS would go on until 30 or Ctrl+Shift+6). */
const TRACE_SILENT_HOPS = 4

type Continue = (ip: string, display: string, ctx: CliContext) => CliCommandResult

/** `target` as an address: itself, an `ip host` entry, or a DNS answer from the name servers (a job). */
function resolveThen(ctx: CliContext, target: string, next: Continue): CliCommandResult {
  if (Ipv4.isValid(target)) return next(target, target, ctx)
  if (/^[\d.]+$/.test(target)) return { lines: cliError(UNRECOGNIZED) }
  const name = target.toLowerCase()
  const dns = RouterEdits.dnsOf(ctx.device)
  const host = dns.records.find((record) => record.name === name)
  if (host !== undefined) return next(host.address, `${target} (${host.address})`, ctx)
  if (managementOf(ctx.device).domainLookup === false) return { lines: cliError(UNRECOGNIZED) }
  const [primary] = dns.forwarders
  if (primary === undefined) {
    return { lines: [...cliText(`Translating "${target}"...domain server (255.255.255.255)`), ...cliError(UNRECOGNIZED)] }
  }
  return {
    lines: cliText(`Translating "${target}"...domain server (${primary})`),
    job: {
      request: { kind: 'dnsQuery', deviceId: ctx.device.id, name, servers: dns.forwarders, useCache: true },
      onDone: (record, doneCtx) => {
        const result = record.result
        if (result?.kind !== 'dns' || !result.answer.ok) return { lines: cliError(UNRECOGNIZED) }
        return next(result.answer.ip, `${target} (${result.answer.ip})`, doneCtx)
      },
    },
  }
}

function ping(ctx: CliContext): CliCommandResult {
  const count = ctx.args.has('count') ? ctx.args.number('count') : DEFAULT_COUNT
  const size = ctx.args.has('size') ? ctx.args.number('size') : DEFAULT_SIZE
  return resolveThen(ctx, ctx.args.text('target'), (ip, _display, runCtx) => ({
    lines: cliText(ABORT_HINT, `Sending ${count}, ${size}-byte ICMP Echos to ${ip}, timeout is 2 seconds:`),
    job: {
      request: { kind: 'ping', deviceId: runCtx.device.id, targetIp: ip, count, size: size - HEADER_BYTES },
      onDone: (record) => ({ lines: cliText(...ProbeViews.ping(record, count)) }),
    },
  }))
}

function traceroute(ctx: CliContext): CliCommandResult {
  return resolveThen(ctx, ctx.args.text('target'), (ip, display, runCtx) => ({
    lines: cliText(ABORT_HINT, `Tracing the route to ${display}`, ''),
    job: {
      request: {
        kind: 'tracert',
        deviceId: runCtx.device.id,
        targetIp: ip,
        maxHops: TRACE_MAX_HOPS,
        probesPerHop: TRACE_PROBES,
        maxSilentHops: TRACE_SILENT_HOPS,
      },
      onDone: (record) => ({ lines: cliText(...ProbeViews.trace(record)) }),
    },
  }))
}

function clearArp(ctx: CliContext): CliCommandResult {
  return { job: { request: { kind: 'clearTable', deviceId: ctx.device.id, table: 'arp' }, onDone: () => ({}) } }
}

/** `repeat` and `size` may follow the target in any order (shared, cyclic children). */
const pingOptions: CliNode[] = []
pingOptions.push(
  keyword('repeat', 'specify repeat count', {
    children: [param('count', { type: 'number', min: 1, max: SIM_LIMITS.echoResultsKept }, 'Repeat count', { run: ping, children: pingOptions })],
  }),
  keyword('size', 'specify datagram size', {
    children: [param('size', { type: 'number', min: MIN_SIZE, max: MAX_SIZE }, 'Datagram size', { run: ping, children: pingOptions })],
  }),
)

export const probeCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('ping', 'Send echo messages', {
      children: [param('target', { type: 'word', label: 'WORD' }, 'Ping destination address or hostname', { run: ping, children: pingOptions })],
    }),
  },
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('traceroute', 'Trace route to destination', {
      children: [param('target', { type: 'word', label: 'WORD' }, 'Trace route to destination address or hostname', { run: traceroute })],
    }),
  },
  {
    modes: ['privilegedExec'],
    node: keyword('clear', 'Reset functions', {
      children: [keyword('arp-cache', 'Clear the entire ARP cache', { run: clearArp })],
    }),
  },
]
