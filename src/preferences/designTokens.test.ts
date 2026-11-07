import { describe, expect, it } from 'vitest'

/** Vitest stubs CSS imports (even ?raw) with an empty string, so the stylesheet is read from disk. */
interface TextFiles {
  readFileSync(path: URL, encoding: 'utf8'): string
}
const fsModule = 'node:fs'
const files: TextFiles = await import(/* @vite-ignore */ fsModule)
const indexCss = files.readFileSync(new URL('../index.css', import.meta.url), 'utf8')

/** `--color-name: #rrggbb;` declarations of the first block that starts with `opening`. */
function tokensOf(opening: string): Map<string, string> {
  const start = indexCss.indexOf(opening)
  if (start < 0) throw new Error(`index.css has no block "${opening}"`)
  const body = indexCss.slice(start + opening.length, indexCss.indexOf('}', start))
  const tokens = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)) {
    if (name !== undefined && value !== undefined) tokens.set(name, value)
  }
  return tokens
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

const light = tokensOf('@theme static {')
const dark = new Map([...light, ...tokensOf('.dark {')])
const highContrast = new Map([...light, ...tokensOf('[data-contrast="more"] {')])
const darkHighContrast = new Map([...dark, ...tokensOf('.dark[data-contrast="more"] {')])

/** Text pairs (WCAG AA 4.5:1): [foreground, backgrounds]. */
const TEXT_PAIRS: readonly [string, readonly string[]][] = [
  ['fg-strong', ['page', 'surface', 'surface-subtle', 'surface-muted', 'surface-strong', 'surface-raised']],
  ['fg', ['page', 'surface', 'surface-subtle', 'surface-muted', 'surface-strong', 'surface-raised']],
  ['fg-muted', ['page', 'surface', 'surface-subtle', 'surface-muted', 'surface-strong', 'surface-raised']],
  ['fg-subtle', ['page', 'surface', 'surface-subtle', 'surface-raised']],
  ['accent-fg', ['accent', 'accent-hover']],
  ['accent-text', ['page', 'surface', 'accent-muted']],
  ['danger', ['surface', 'danger-muted']],
  ['warning', ['surface', 'warning-muted']],
  ['success', ['surface', 'success-muted']],
  ['port-label', ['canvas', 'port-label-halo']],
]

/** Non-text pairs (WCAG 1.4.11, 3:1) checked in dark mode, where no "today's look" applies. */
const DARK_GRAPHIC_PAIRS: readonly [string, string][] = [
  ['focus', 'surface'],
  ['cable', 'canvas'],
  ['link-up', 'canvas'],
  ['link-down', 'canvas'],
  ['node-border', 'canvas'],
  ['accent', 'page'],
  ...['arp', 'icmp', 'dhcp', 'dns', 'http', 'tcp', 'udp', 'ipv4', 'ethernet', 'hdlc', 'dropped', 'highlight'].map(
    (protocol): [string, string] => [`packet-${protocol}`, 'canvas'],
  ),
]

function ratio(tokens: Map<string, string>, a: string, b: string): number {
  const first = tokens.get(a)
  const second = tokens.get(b)
  if (first === undefined || second === undefined) throw new Error(`Missing token ${first === undefined ? a : b}`)
  return contrast(first, second)
}

describe('design tokens (src/index.css)', () => {
  it('overrides every light token in dark mode', () => {
    expect([...tokensOf('.dark {').keys()].sort()).toEqual([...light.keys()].sort())
  })

  it.each([
    ['light', light],
    ['dark', dark],
    ['high contrast', highContrast],
    ['dark high contrast', darkHighContrast],
  ])('meets WCAG AA for text in %s', (_mode, tokens) => {
    for (const [foreground, backgrounds] of TEXT_PAIRS) {
      for (const background of backgrounds) {
        expect(ratio(tokens, foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps graphics visible (3:1) in dark mode', () => {
    for (const [graphic, background] of DARK_GRAPHIC_PAIRS) {
      expect(ratio(dark, graphic, background), `${graphic} on ${background}`).toBeGreaterThanOrEqual(3)
    }
  })
})
