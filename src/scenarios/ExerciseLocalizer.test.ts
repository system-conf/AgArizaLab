import { createInstance, type i18n as I18n } from 'i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import enExercises from '../locales/en/exercises.json'
import trExercises from '../locales/tr/exercises.json'
import type { Exercise, ExerciseDefinition } from '../domain'
import { exerciseDefinitions } from './exerciseDefinitions'
import { ExerciseLocalizer } from './ExerciseLocalizer'

let i18n: I18n

beforeAll(async () => {
  i18n = createInstance()
  await i18n.init({
    resources: { tr: { exercises: trExercises }, en: { exercises: enExercises } },
    lng: 'tr',
    fallbackLng: false,
    ns: ['exercises'],
    interpolation: { escapeValue: false },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function localize(definition: ExerciseDefinition, language: string): Exercise {
  return new ExerciseLocalizer(i18n.getFixedT(language)).localize(definition)
}

function definitionOf(id: string): ExerciseDefinition {
  const definition = exerciseDefinitions.find((candidate) => candidate.id === id)
  if (definition === undefined) throw new Error(`No exercise ${id}`)
  return definition
}

/** Every text of a localized exercise that must not be a placeholder id. */
function placeholderCandidates(exercise: Exercise): [string, string][] {
  const { texts } = exercise
  const devices = exercise.lab.state.devices
  return [
    ['title', texts.title],
    ['complaint.from', texts.complaint.from],
    ['complaint.message', texts.complaint.message],
    ...texts.guide.map((step, index): [string, string] => [`hints.${index}`, step]),
    ['explanation.whatHappened', texts.explanation.whatHappened],
    ['explanation.realLife', texts.explanation.realLife],
    ['explanation.interviewAnswer', texts.explanation.interviewAnswer],
    ...devices.map((device): [string, string] => [`devices.${device.id}`, device.name]),
    ...devices.flatMap((device) =>
      (device.host?.appLinks ?? []).map((appLink): [string, string] => [`appLinks.${appLink.id}`, appLink.label]),
    ),
  ]
}

function idsOf(definition: ExerciseDefinition): Set<string> {
  const ids = new Set([definition.id])
  for (const device of definition.lab.state.devices) {
    ids.add(device.id)
    for (const appLink of device.host?.appLinks ?? []) ids.add(appLink.id)
  }
  return ids
}

describe.each(['tr', 'en'])('ExerciseLocalizer (%s)', (language) => {
  it.each(exerciseDefinitions.map((definition): [string, ExerciseDefinition] => [definition.id, definition]))(
    '%s has every text filled and no placeholder id left',
    (_id, definition) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const exercise = localize(definition, language)
      const ids = idsOf(definition)
      for (const [path, text] of placeholderCandidates(exercise)) {
        expect(text.trim(), path).not.toBe('')
        expect(ids.has(text), `${path} = '${text}'`).toBe(false)
        expect(text, path).not.toContain(`${definition.id}.`)
      }
      expect(exercise.texts.guide).toHaveLength(3)
      expect(exercise.texts.topics.length).toBeGreaterThanOrEqual(1)
      expect(warn).not.toHaveBeenCalled()
    },
  )
})

describe('ExerciseLocalizer', () => {
  const posGateway = definitionOf('posGateway')

  it('keeps the data of the definition and does not mutate it', () => {
    const exercise = localize(posGateway, 'en')
    expect(exercise.id).toBe(posGateway.id)
    expect(exercise.order).toBe(posGateway.order)
    expect(exercise.setting).toBe(posGateway.setting)
    expect(exercise.solvedWhen).toBe(posGateway.solvedWhen)
    expect(exercise.locks).toBe(posGateway.locks)
    expect(exercise.lab.layout).toBe(posGateway.lab.layout)
    expect(exercise.lab.state.links).toBe(posGateway.lab.state.links)
    expect(exercise.lab.state.devices.map((device) => device.id)).toEqual(posGateway.lab.state.devices.map((device) => device.id))
    expect(posGateway.lab.state.devices.find((device) => device.id === 'kasa')?.name).toBe('kasa')
  })

  it('follows the language of t', () => {
    const turkish = localize(posGateway, 'tr')
    const english = localize(posGateway, 'en')
    expect(turkish.texts.title).toBe('Kasa internete çıkmıyor')
    expect(english.texts.title).toBe('The POS terminal cannot reach the internet')
    expect(turkish.lab.state.devices.find((device) => device.id === 'kasa')?.name).toBe('Kasa (POS)')
    expect(english.lab.state.devices.find((device) => device.id === 'kasa')?.name).toBe('POS terminal')
  })

  it('warns and falls back to the ids when texts are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const exercise = localize({ ...posGateway, id: 'unknownExercise' }, 'en')
    expect(exercise.texts.title).toBe('unknownExercise')
    expect(exercise.texts.guide).toEqual(['unknownExercise', 'unknownExercise', 'unknownExercise'])
    expect(exercise.texts.topics).toEqual([])
    expect(exercise.lab.state.devices.map((device) => device.name)).toEqual(posGateway.lab.state.devices.map((device) => device.id))
    expect(warn).toHaveBeenCalled()
  })

  it('falls back to the app link id when only a label is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const definition = definitionOf('printerDhcp')
    const { state } = definition.lab
    const withExtraLink: ExerciseDefinition = {
      ...definition,
      lab: {
        ...definition.lab,
        state: {
          ...state,
          devices: state.devices.map((device) =>
            device.id === 'muhasebe' && device.host
              ? { ...device, host: { ...device.host, appLinks: [{ id: 'nas', label: 'nas', targetIp: '192.168.1.40', targetKind: 'pc' as const }] } }
              : device,
          ),
        },
      },
    }
    const muhasebe = localize(withExtraLink, 'en').lab.state.devices.find((device) => device.id === 'muhasebe')
    expect(muhasebe?.name).toBe('Accounting PC')
    expect(muhasebe?.host?.appLinks[0]?.label).toBe('nas')
    expect(warn).toHaveBeenCalledOnce()
  })
})
