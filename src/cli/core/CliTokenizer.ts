// Splits a command line into words with their positions (for the caret of "% Invalid input").

export interface CliToken {
  readonly text: string
  /** Index of the first character in the typed line. */
  readonly start: number
}

export class CliTokenizer {
  /** Words separated by whitespace. IOS has no quoting; a `line` parameter takes the raw rest instead. */
  static tokenize(line: string): CliToken[] {
    const tokens: CliToken[] = []
    const pattern = /\S+/g
    for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
      tokens.push({ text: match[0], start: match.index })
    }
    return tokens
  }

  /** True when the line ends with whitespace (or is blank): `?` then lists the next words. */
  static endsWithSpace(line: string): boolean {
    return line.length === 0 || /\s$/.test(line)
  }
}
