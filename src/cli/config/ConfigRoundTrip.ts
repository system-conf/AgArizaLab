// Config text → device (BACKLOG 8 "paste a config", docs/CLI.md §5.3 rule "every run handler accepts the
// lines its contributor writes"): replays exported text through the CLI session on the device's factory
// configuration and lists what still differs from the original, as JSON paths.
import type { Device } from '../../domain'
import type { CliShell } from '../core/CliShell'
import { FactoryReset } from '../core/FactoryReset'
import { DeviceConfigText } from './DeviceConfigText'

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

/**
 * The settings to compare: DHCP leases (what the server learned, no config line carries them) are dropped,
 * and a port's `speed` / `duplex` of 'auto' counts as absent (PortTypes: "Absent = 'auto'"; the core's
 * `speed auto` / `duplex auto` store the value, routers always print it).
 */
function settingsOf(device: Device): Json {
  const ports = device.ports.map((port) => ({
    ...port,
    speed: port.speed === 'auto' ? undefined : port.speed,
    duplex: port.duplex === 'auto' ? undefined : port.duplex,
  }))
  const dhcp = device.services?.dhcp
  const services = dhcp === undefined ? device.services : { ...device.services, dhcp: { ...dhcp, pools: dhcp.pools.map((pool) => ({ ...pool, leases: [] })) } }
  return JSON.parse(JSON.stringify({ ...device, ports, services })) as Json
}

function isRecord(value: Json): value is { readonly [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collect(path: string, expected: Json | undefined, actual: Json | undefined, out: string[]): void {
  if (expected === undefined || actual === undefined || !isRecord(expected) || !isRecord(actual)) {
    if (Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length) {
      expected.forEach((item: Json, index: number) => collect(`${path}[${index}]`, item, actual[index], out))
      return
    }
    if (JSON.stringify(expected) !== JSON.stringify(actual)) out.push(path)
    return
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  for (const key of [...keys].sort()) collect(path === '' ? key : `${path}.${key}`, expected[key], actual[key], out)
}

export class ConfigRoundTrip {
  private readonly shell: CliShell
  private readonly text: DeviceConfigText

  constructor(shell: CliShell) {
    this.shell = shell
    this.text = new DeviceConfigText(shell)
  }

  /** Factory configuration with every interface up: what a config is replayed on (like `reload`). */
  static blank(device: Device): Device {
    return FactoryReset.interfacesUp(FactoryReset.of(device))
  }

  /** The text replayed on the device's blank configuration. */
  replay(device: Device, text: string): Device {
    return this.shell.replay(ConfigRoundTrip.blank(device), text)
  }

  /** Export → replay: the rebuilt device. */
  rebuild(device: Device): Device {
    return this.replay(device, this.text.lines(device).join('\n'))
  }

  /** JSON paths where `actual` differs from `expected` (DHCP leases ignored); [] = same settings. */
  static differences(expected: Device, actual: Device): string[] {
    const out: string[] = []
    collect('', settingsOf(expected), settingsOf(actual), out)
    return out
  }
}
