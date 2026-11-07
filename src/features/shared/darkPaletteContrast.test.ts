import { describe, expect, it } from 'vitest'

/**
 * Dark mode outside the design tokens (docs/PREFERENCES.md §5): coloured status boxes, chips and
 * badges keep their Tailwind hue and get `dark:` partners: `bg-<hue>-50` → `dark:bg-<hue>-950/40`,
 * `bg-<hue>-100` → `dark:bg-<hue>-900/40`, text 600–950 → `dark:text-<hue>-200/300`. This test checks
 * those pairs reach WCAG AA (4.5:1) on the dark surfaces they sit on. Vitest stubs CSS imports, so
 * the stylesheets are read from disk.
 */
interface TextFiles {
  readFileSync(path: URL, encoding: 'utf8'): string
}
const fsModule = 'node:fs'
const files: TextFiles = await import(/* @vite-ignore */ fsModule)
const tailwindTheme = files.readFileSync(new URL('../../../node_modules/tailwindcss/theme.css', import.meta.url), 'utf8')
const indexCss = files.readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

type Rgb = readonly [number, number, number]

/** Hues that carry status or category colour in the UI (grep `dark:text-<hue>` under src/features). */
const HUES = ['sky', 'emerald', 'rose', 'amber', 'red', 'violet', 'teal', 'indigo', 'pink', 'cyan', 'blue', 'orange', 'stone'] as const

function palette(name: string): Rgb {
  const match = new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(tailwindTheme)
  if (match === null) throw new Error(`Tailwind has no colour ${name}`)
  return oklchToSrgb(Number(match[1]) / 100, Number(match[2]), Number(match[3]))
}

function darkToken(name: string): Rgb {
  const block = indexCss.slice(indexCss.indexOf('.dark {'))
  const match = new RegExp(`--color-${name}:\\s*#([0-9a-f]{6});`).exec(block)
  if (match?.[1] === undefined) throw new Error(`index.css has no dark token ${name}`)
  const hex = match[1]
  const channel = (index: number) => parseInt(hex.slice(index, index + 2), 16) / 255
  return [channel(0), channel(2), channel(4)]
}

/** OKLCH → gamma-encoded sRGB in 0..1 (clipped to the gamut, as browsers do for these colours). */
function oklchToSrgb(lightness: number, chroma: number, hueDegrees: number): Rgb {
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const [red = 0, green = 0, blue = 0] = linear.map((channel) => {
    const clipped = Math.min(1, Math.max(0, channel))
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055
  })
  return [red, green, blue]
}

function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  const mix = (index: 0 | 1 | 2) => top[index] * alpha + bottom[index] * (1 - alpha)
  return [mix(0), mix(1), mix(2)]
}

function luminance(colour: Rgb): number {
  const [r = 0, g = 0, b = 0] = colour.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(first: Rgb, second: Rgb): number {
  const [light = 0, dark = 0] = [luminance(first), luminance(second)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('dark-mode hue pairs (dark: utilities)', () => {
  const surfaces = { surface: darkToken('surface'), 'surface-subtle': darkToken('surface-subtle'), page: darkToken('page') }

  it.each(HUES)('%s text reads on its dark boxes and on plain surfaces', (hue) => {
    const backgrounds: [string, Rgb][] = []
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      backgrounds.push([surfaceName, surface])
      backgrounds.push([`${hue}-950/40 on ${surfaceName}`, over(palette(`${hue}-950`), 0.4, surface)])
      backgrounds.push([`${hue}-900/40 on ${surfaceName}`, over(palette(`${hue}-900`), 0.4, surface)])
      backgrounds.push([`${hue}-800/50 on ${surfaceName}`, over(palette(`${hue}-800`), 0.5, surface)])
    }
    for (const text of ['200', '300']) {
      for (const [name, background] of backgrounds) {
        expect(contrast(palette(`${hue}-${text}`), background), `text-${hue}-${text} on ${name}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('reads the Tailwind palette correctly (white on black is 21:1)', () => {
    expect(contrast(oklchToSrgb(1, 0, 0), oklchToSrgb(0, 0, 0))).toBeCloseTo(21, 1)
  })
})
