/** The whole number in `text`, or null when it is not one between `min` and `max`. */
export function parseWholeNumber(text: string, min: number, max: number): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value >= min && value <= max ? value : null
}
