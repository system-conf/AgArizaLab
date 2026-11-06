// IOS parser errors, exactly as IOS prints them (each followed by an empty line).

export class CliErrors {
  /** Caret under column `column` of the echoed line (prompt included), then the message. */
  static invalid(column: number): string[] {
    return [`${' '.repeat(Math.max(0, column))}^`, "% Invalid input detected at '^' marker.", '']
  }

  static incomplete(): string[] {
    return ['% Incomplete command.', '']
  }

  /** `input` = the typed line, trimmed. */
  static ambiguous(input: string): string[] {
    return [`% Ambiguous command:  "${input.trim()}"`, '']
  }

  /** An unknown single word in EXEC mode is taken as a host name to connect to (IOS). */
  static unknownHost(word: string, domainLookup: boolean): string[] {
    const translating = domainLookup ? `Translating "${word}"...domain server (255.255.255.255)` : `Translating "${word}"`
    return [translating, '% Unknown command or computer name, or unable to find computer address']
  }
}
