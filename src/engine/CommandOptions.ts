/** Which options a Windows command accepts (names lower case, without the leading '-' or '/'). */
export interface OptionSpec {
  /** Options without a value, e.g. 't', '4'. */
  flags: readonly string[]
  /** Options followed by a value, e.g. 'n', 'l'. */
  valued: readonly string[]
}

/** Why a command line was rejected; `option` / `value` are shown as the user typed them. */
export type OptionError =
  | { kind: 'badOption'; option: string }
  | { kind: 'missingValue'; option: string }
  | { kind: 'badValue'; option: string; min: number; max: number }
  | { kind: 'badParameter'; value: string }
  | { kind: 'missingTarget' }

/** A valued option as typed: `option` keeps the user's spelling for error messages. */
export interface OptionValue {
  option: string
  value: string
}

export interface ParsedOptions {
  target: string
  /** Flags that were given (lower case names). */
  flags: ReadonlySet<string>
  /** Valued options that were given (lower case name → value; the last one wins). */
  values: ReadonlyMap<string, OptionValue>
}

export type OptionParseResult = { ok: true; options: ParsedOptions } | { ok: false; error: OptionError }

/**
 * Windows-style argument parsing: options start with '-' or '/', are case-insensitive and may come
 * before or after the single target. The first error found wins, like on Windows.
 */
export class CommandOptions {
  static parse(args: readonly string[], spec: OptionSpec): OptionParseResult {
    const flags = new Set<string>()
    const values = new Map<string, OptionValue>()
    let target: string | null = null

    for (let index = 0; index < args.length; index += 1) {
      const token = args[index] ?? ''
      if (!CommandOptions.isOption(token)) {
        if (target !== null) return { ok: false, error: { kind: 'badParameter', value: token } }
        target = token
        continue
      }
      const name = token.slice(1).toLowerCase()
      if (spec.flags.includes(name)) {
        flags.add(name)
      } else if (spec.valued.includes(name)) {
        const value = args[index + 1]
        if (value === undefined) return { ok: false, error: { kind: 'missingValue', option: token } }
        values.set(name, { option: token, value })
        index += 1
      } else {
        return { ok: false, error: { kind: 'badOption', option: token } }
      }
    }
    if (target === null) return { ok: false, error: { kind: 'missingTarget' } }
    return { ok: true, options: { target, flags, values } }
  }

  /** A whole-number option value inside [min, max], or null. */
  static integerIn(value: string, min: number, max: number): number | null {
    if (!/^\d+$/.test(value)) return null
    const parsed = Number(value)
    return parsed >= min && parsed <= max ? parsed : null
  }

  private static isOption(token: string): boolean {
    return token.startsWith('-') || token.startsWith('/')
  }
}
