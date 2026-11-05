import { describe, expect, it } from 'vitest'
import { fallbackLanguage, languages } from './languages'
import { namespaces } from './namespaces'

const localeFiles = import.meta.glob<unknown>('../locales/*/*.json', { eager: true, import: 'default' })

const filePattern = /\/locales\/([^/]+)\/([^/]+)\.json$/
const placeholderPattern = /\{\{\s*([^\s,}]+)/g

/** language → namespace → JSON content */
function filesByLanguage(): Map<string, Map<string, unknown>> {
  const result = new Map<string, Map<string, unknown>>()
  for (const [path, data] of Object.entries(localeFiles)) {
    const match = filePattern.exec(path)
    const language = match?.[1]
    const namespace = match?.[2]
    if (language === undefined || namespace === undefined) throw new Error(`Unexpected locale path ${path}`)
    const byNamespace = result.get(language) ?? new Map<string, unknown>()
    byNamespace.set(namespace, data)
    result.set(language, byNamespace)
  }
  return result
}

/** Flattens JSON into 'path.to.key' → string value (array items addressed by index). */
function flatten(node: unknown, prefix = '', into = new Map<string, string>()): Map<string, string> {
  if (typeof node === 'string') {
    into.set(prefix, node)
  } else if (Array.isArray(node)) {
    node.forEach((item: unknown, index) => flatten(item, prefix === '' ? `${index}` : `${prefix}.${index}`, into))
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) flatten(value, prefix === '' ? key : `${prefix}.${key}`, into)
  } else {
    // Numbers, booleans and null are not valid translations.
    into.set(prefix, `<invalid ${typeof node}>`)
  }
  return into
}

function placeholders(text: string): string[] {
  return [...text.matchAll(placeholderPattern)].map((match) => match[1] ?? '').sort()
}

const files = filesByLanguage()
const reference = files.get(fallbackLanguage) ?? new Map<string, unknown>()
const otherLanguages = [...files.keys()].filter((language) => language !== fallbackLanguage)

describe('locale folders', () => {
  it('has a folder for every language in languages.ts and no other', () => {
    expect([...files.keys()].sort()).toEqual(languages.map((language) => language.code).sort())
  })

  it('has exactly the namespaces of namespaces.ts in the fallback language', () => {
    expect([...reference.keys()].sort()).toEqual([...namespaces].sort())
  })

  it('has only string values in the fallback language', () => {
    for (const [namespace, data] of reference) {
      const invalid = [...flatten(data)].filter(([, value]) => value.startsWith('<invalid '))
      expect(invalid, `${fallbackLanguage}/${namespace}`).toEqual([])
    }
  })
})

describe.each(otherLanguages)('locale %s', (language) => {
  const languageFiles = files.get(language) ?? new Map<string, unknown>()

  it(`has the same namespaces as ${fallbackLanguage}`, () => {
    expect([...languageFiles.keys()].sort()).toEqual([...reference.keys()].sort())
  })

  it.each([...namespaces])(`namespace %s has the same keys and placeholders as ${fallbackLanguage}`, (namespace) => {
    const expected = flatten(reference.get(namespace))
    const actual = flatten(languageFiles.get(namespace))
    const missing = [...expected.keys()].filter((key) => !actual.has(key))
    const extra = [...actual.keys()].filter((key) => !expected.has(key))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    for (const [key, text] of actual) {
      expect(placeholders(text), `${language}/${namespace}:${key}`).toEqual(placeholders(expected.get(key) ?? ''))
    }
  })
})
