// Parameter values of a parsed command line (CliArgsReader of the contract).
import type { CliArgsReader, CliInterfaceName, CliValue } from '../contract'

function isInterfaceName(value: CliValue): value is CliInterfaceName {
  return typeof value === 'object' && !Array.isArray(value) && 'longName' in value
}

function isNameList(value: CliValue): value is readonly CliInterfaceName[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'object')
}

function isNumberList(value: CliValue): value is readonly number[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'number')
}

export class CliArgs implements CliArgsReader {
  static readonly empty = new CliArgs(new Map())

  private readonly values: ReadonlyMap<string, CliValue>

  constructor(values: ReadonlyMap<string, CliValue>) {
    this.values = values
  }

  /** A copy with one more value (a later value of the same name wins: repeated options). */
  with(name: string, value: CliValue): CliArgs {
    return new CliArgs(new Map([...this.values, [name, value]]))
  }

  has(name: string): boolean {
    return this.values.has(name)
  }

  value(name: string): CliValue | undefined {
    return this.values.get(name)
  }

  text(name: string): string {
    const value = this.require(name)
    if (typeof value !== 'string') throw new Error(`CLI argument '${name}' is not text`)
    return value
  }

  number(name: string): number {
    const value = this.require(name)
    if (typeof value !== 'number') throw new Error(`CLI argument '${name}' is not a number`)
    return value
  }

  numbers(name: string): readonly number[] {
    const value = this.require(name)
    if (!isNumberList(value)) throw new Error(`CLI argument '${name}' is not a number list`)
    return value
  }

  interface(name: string): CliInterfaceName {
    const value = this.require(name)
    if (!isInterfaceName(value)) throw new Error(`CLI argument '${name}' is not an interface`)
    return value
  }

  interfaces(name: string): readonly CliInterfaceName[] {
    const value = this.require(name)
    if (!isNameList(value)) throw new Error(`CLI argument '${name}' is not an interface list`)
    return value
  }

  private require(name: string): CliValue {
    const value = this.values.get(name)
    if (value === undefined) throw new Error(`CLI argument '${name}' was not parsed`)
    return value
  }
}
