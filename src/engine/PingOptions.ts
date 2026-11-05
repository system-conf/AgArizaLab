import { CommandOptions, type OptionError, type OptionSpec } from './CommandOptions'

/** What a ping command line asks for, after validation. */
export interface PingSettings {
  target: string
  /** Echo requests to show (1..PingOptions.maxCount). */
  count: number
  /** Data bytes per request (-l). */
  size: number
  /** -t was given: continuous ping is not supported, so `count` is the default 4. */
  continuous: boolean
}

export type PingParseResult = { ok: true; settings: PingSettings } | { ok: false; error: OptionError }

const SPEC: OptionSpec = { flags: ['t', '4'], valued: ['n', 'l'] }
const DEFAULT_COUNT = 4
const DEFAULT_SIZE = 32
/** Windows' own limits, used in its "Bad value" messages. */
const WINDOWS_MAX_COUNT = 4294967295
const MAX_SIZE = 65500

/** Parses `ping [-n count] [-l size] [-t] [-4] target` the way Windows validates it. */
export class PingOptions {
  /** Larger -n values are accepted (as on Windows) but only this many requests are shown. */
  static readonly maxCount = 20

  static parse(args: readonly string[]): PingParseResult {
    const parsed = CommandOptions.parse(args, SPEC)
    if (!parsed.ok) return parsed
    const { target, flags, values } = parsed.options

    let count = DEFAULT_COUNT
    const countOption = values.get('n')
    if (countOption !== undefined) {
      const value = CommandOptions.integerIn(countOption.value, 1, WINDOWS_MAX_COUNT)
      if (value === null) return PingOptions.badValue(countOption.option, 1, WINDOWS_MAX_COUNT)
      count = Math.min(value, PingOptions.maxCount)
    }

    let size = DEFAULT_SIZE
    const sizeOption = values.get('l')
    if (sizeOption !== undefined) {
      const value = CommandOptions.integerIn(sizeOption.value, 0, MAX_SIZE)
      if (value === null) return PingOptions.badValue(sizeOption.option, 0, MAX_SIZE)
      size = value
    }

    const continuous = flags.has('t')
    return { ok: true, settings: { target, count: continuous ? DEFAULT_COUNT : count, size, continuous } }
  }

  /** Windows names the option as typed ("-n" or "/N"). */
  private static badValue(option: string, min: number, max: number): PingParseResult {
    return { ok: false, error: { kind: 'badValue', option, min, max } }
  }
}
