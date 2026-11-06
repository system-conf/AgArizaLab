// Search of the device palette: every word of the query must occur in the model's search text
// (name, description, use case, port summary, capabilities…). Case, accents and the
// Turkish dotless i are ignored, so "poe", "48" or "kablosuz" find what a user expects.

/** One searchable palette model; the texts are already translated by the UI. */
export interface PaletteSearchEntry {
  modelId: string
  /** Translated model name (matches here rank first). */
  name: string
  /** Everything else the search should find, joined. */
  searchText: string
}

/** Lower-case, without diacritics; 'ı' → 'i' and '×' → 'x' so "24x" finds "24× Fa". */
export function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('ı', 'i')
    .replaceAll('×', 'x')
}

interface IndexedEntry {
  modelId: string
  name: string
  text: string
}

export class PaletteFilter {
  private readonly entries: readonly IndexedEntry[]

  constructor(entries: readonly PaletteSearchEntry[]) {
    this.entries = entries.map((entry) => ({
      modelId: entry.modelId,
      name: normalizeSearchText(entry.name),
      text: normalizeSearchText(`${entry.name} ${entry.searchText}`),
    }))
  }

  /** Words of a query; empty for a blank query. */
  static tokens(query: string): string[] {
    return normalizeSearchText(query).split(/\s+/u).filter((token) => token.length > 0)
  }

  /**
   * Model ids matching every word of the query: name matches first, otherwise in entry order.
   * A blank query matches nothing (the palette then shows its categories).
   */
  search(query: string): string[] {
    const tokens = PaletteFilter.tokens(query)
    if (tokens.length === 0) return []
    const matches = this.entries.filter((entry) => tokens.every((token) => entry.text.includes(token)))
    const byName = matches.filter((entry) => tokens.every((token) => entry.name.includes(token)))
    const rest = matches.filter((entry) => !byName.includes(entry))
    return [...byName, ...rest].map((entry) => entry.modelId)
  }
}
