import type { HandoverBlock, HandoverLine, HandoverPage, HandoverText, MessageTranslator } from './HandoverTypes'

/** Writes a handover page as Markdown (GitHub flavour: pipe tables) for the download. */
export class HandoverMarkdown {
  private readonly translate: MessageTranslator

  constructor(translate: MessageTranslator) {
    this.translate = translate
  }

  write(page: HandoverPage): string {
    const lines: string[] = [`# ${this.inline(page.heading)}: ${this.inline(page.title)}`, '']
    for (const fact of page.meta) lines.push(`- **${this.inline(fact.label)}:** ${this.inline(fact.value)}`)
    for (const section of page.sections) {
      lines.push('', `## ${this.inline(section.title)}`)
      for (const block of section.blocks) lines.push('', ...this.block(block))
    }
    return `${lines.join('\n').trim()}\n`
  }

  private block(block: HandoverBlock): string[] {
    switch (block.type) {
      case 'paragraph':
        return [this.inline(block.text)]
      case 'facts':
        return [...this.caption(block.caption, '###'), ...block.items.map((item) => `- **${this.inline(item.label)}:** ${this.inline(item.value)}`)]
      case 'list':
        return [...this.caption(block.caption, '###'), ...block.items.map((item) => `- ${this.line(item)}`)]
      case 'table': {
        const header = block.columns.map((column) => this.cell(column))
        return [
          ...this.caption(block.caption, '###'),
          this.row(header),
          this.row(header.map(() => '---')),
          ...block.rows.map((row) => this.row(row.map((cell) => this.cell(cell)))),
        ]
      }
    }
  }

  private caption(caption: HandoverText | undefined, level: string): string[] {
    return caption === undefined ? [] : [`${level} ${this.inline(caption)}`, '']
  }

  private row(cells: readonly string[]): string {
    return `| ${cells.join(' | ')} |`
  }

  /** A table cell: pipes escaped, line breaks flattened. */
  private cell(text: HandoverText): string {
    return this.inline(text).replace(/\|/g, '\\|')
  }

  private line(parts: HandoverLine): string {
    return parts.map((part) => this.inline(part)).join(' ')
  }

  /** Translated text on one line; Markdown emphasis characters of user content are escaped. */
  private inline(text: HandoverText): string {
    const plain = typeof text === 'string' ? text : this.translate(text)
    return plain.replace(/\s*\n\s*/g, ' ').replace(/([\\`*_[\]<>])/g, '\\$1')
  }
}
