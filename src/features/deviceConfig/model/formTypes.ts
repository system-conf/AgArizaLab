// Shared shapes of the device configuration forms: per-field validation messages and small
// immutable list helpers for the row editors (VLANs, routes, pools…).
import type { LocalizedMessage } from '../../../domain/Messages'

/** Validation messages per field; a missing key = the field is fine. */
export type FieldErrors<Field extends string> = Partial<Record<Field, LocalizedMessage>>

export function hasErrors(errors: Partial<Record<string, LocalizedMessage>>): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}

export function anyRowErrors(rows: readonly Partial<Record<string, LocalizedMessage>>[]): boolean {
  return rows.some(hasErrors)
}

export function patchAt<Item>(list: readonly Item[], index: number, patch: Partial<Item>): Item[] {
  return list.map((item, position) => (position === index ? { ...item, ...patch } : item))
}

export function removeAt<Item>(list: readonly Item[], index: number): Item[] {
  return list.filter((_, position) => position !== index)
}

let rowCounter = 0

/** React key for a row the user adds (existing rows use their own ids). */
export function newRowKey(): string {
  rowCounter += 1
  return `new${rowCounter}`
}

/** Trimmed text, or undefined when blank (optional strings such as descriptions are left out). */
export function optionalText(text: string): string | undefined {
  const value = text.trim()
  return value === '' ? undefined : value
}

/** Integer in [min, max] written with digits only, or null. */
export function parseWholeNumber(text: string, min: number, max: number): number | null {
  const value = text.trim()
  if (!/^\d{1,10}$/.test(value)) return null
  const number = Number(value)
  return number >= min && number <= max ? number : null
}

/** The member of `values` equal to `value` (a select's string), or undefined. */
export function pick<Value extends string>(values: readonly Value[], value: string): Value | undefined {
  return values.find((candidate) => candidate === value)
}
