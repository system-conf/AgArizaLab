import { describe, expect, it } from 'vitest'
import enTexts from '../../locales/en/designBriefs.json'
import trTexts from '../../locales/tr/designBriefs.json'
import type { DesignExerciseDefinition } from '../../domain'
import { designExercises } from './index'

const textsByLanguage: [string, unknown][] = [
  ['tr', trTexts],
  ['en', enTexts],
]

/** Value at a dot path of parsed JSON, or undefined when any segment is missing. */
function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    const next: unknown = Reflect.get(current, segment)
    return next
  }, value)
}

function expectText(value: unknown, path: string): void {
  expect(typeof value, path).toBe('string')
  expect(String(value).trim(), path).not.toBe('')
}

/** Keys of a JSON object (sorted), [] when absent; every value must be a non-empty string. */
function textKeys(value: unknown, path: string): string[] {
  if (value === undefined) return []
  expect(typeof value === 'object' && value !== null && !Array.isArray(value), path).toBe(true)
  const entries = typeof value === 'object' && value !== null ? Object.entries(value) : []
  entries.forEach(([key, text]) => expectText(text, `${path}.${key}`))
  return entries.map(([key]) => key).sort()
}

function sorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort()
}

/** Every device of the starting lab and the reference design (the review shows the reference too). */
function deviceIds(brief: DesignExerciseDefinition): string[] {
  return sorted([...brief.lab.state.devices, ...brief.reference.state.devices].map((device) => device.id))
}

function zoneIds(brief: DesignExerciseDefinition): string[] {
  return sorted([...brief.lab.annotations, ...brief.reference.annotations].map((annotation) => annotation.id))
}

describe.each(textsByLanguage)('designBriefs.json (%s)', (_language, texts) => {
  it('has texts for exactly the defined briefs', () => {
    const keys = typeof texts === 'object' && texts !== null ? Object.keys(texts).sort() : []
    expect(keys).toEqual(sorted(designExercises.map((brief) => brief.id)))
  })

  it.each(designExercises.map((brief): [string, DesignExerciseDefinition] => [brief.id, brief]))('%s has complete texts', (id, brief) => {
    const briefTexts = at(texts, id)
    for (const path of ['title', 'customer.from', 'customer.message', 'reference.explanation', 'reference.presentation', 'reference.interviewAnswer']) {
      expectText(at(briefTexts, path), `${id}.${path}`)
    }
    const topics = at(briefTexts, 'topics')
    expect(Array.isArray(topics) && topics.length > 0, `${id}.topics`).toBe(true)
    if (Array.isArray(topics)) topics.forEach((topic: unknown, index) => expectText(topic, `${id}.topics.${index}`))
    expect(textKeys(at(briefTexts, 'groups'), `${id}.groups`)).toEqual(sorted(brief.groups.map((group) => group.id)))
    expect(textKeys(at(briefTexts, 'devices'), `${id}.devices`)).toEqual(deviceIds(brief))
    expect(textKeys(at(briefTexts, 'zones'), `${id}.zones`)).toEqual(zoneIds(brief))
    expect(textKeys(at(briefTexts, 'reviewHints'), `${id}.reviewHints`)).toEqual(sorted(brief.reviewHints.map((hint) => hint.id)))
  })
})

describe('designBriefs.json across languages', () => {
  it.each(designExercises.map((brief) => [brief.id]))('%s has the same topic count in tr and en', (id) => {
    const trTopics = at(trTexts, `${id}.topics`)
    const enTopics = at(enTexts, `${id}.topics`)
    expect(Array.isArray(trTopics) && Array.isArray(enTopics)).toBe(true)
    expect(Array.isArray(trTopics) ? trTopics.length : -1).toBe(Array.isArray(enTopics) ? enTopics.length : -2)
  })
})
