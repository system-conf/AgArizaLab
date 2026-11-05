import { createInstance, type i18n as I18n } from 'i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import enExercises from '../locales/en/exercises.json'
import trExercises from '../locales/tr/exercises.json'
import type { Scenario, ScenarioDefinition } from '../domain/ScenarioTypes'
import { localizeScenario, ScenarioLocalizer } from './ScenarioLocalizer'
import { posGateway } from './posGateway'
import { scenarioDefinitions } from './scenarioDefinitions'

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

/** Every text of a localized scenario that must not be a placeholder id. */
function placeholderCandidates(scenario: Scenario): [string, string][] {
  const devices = scenario.initialState.devices
  return [
    ['title', scenario.title],
    ['complaint.from', scenario.complaint.from],
    ['complaint.message', scenario.complaint.message],
    ...scenario.hints.map((hint, index): [string, string] => [`hints.${index}`, hint]),
    ['explanation.whatHappened', scenario.explanation.whatHappened],
    ['explanation.realLife', scenario.explanation.realLife],
    ['explanation.interviewAnswer', scenario.explanation.interviewAnswer],
    ...devices.map((device): [string, string] => [`devices.${device.id}`, device.name]),
    ...devices.flatMap((device) =>
      (device.appLinks ?? []).map((appLink): [string, string] => [`appLinks.${appLink.id}`, appLink.label]),
    ),
  ]
}

function idsOf(definition: ScenarioDefinition): Set<string> {
  const ids = new Set([definition.id])
  for (const device of definition.initialState.devices) {
    ids.add(device.id)
    for (const appLink of device.appLinks ?? []) ids.add(appLink.id)
  }
  return ids
}

describe.each(['tr', 'en'])('localizeScenario (%s)', (language) => {
  it.each(scenarioDefinitions.map((definition): [string, ScenarioDefinition] => [definition.id, definition]))(
    '%s has every text filled and no placeholder id left',
    (_id, definition) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const scenario = localizeScenario(definition, i18n.getFixedT(language))
      const ids = idsOf(definition)
      for (const [path, text] of placeholderCandidates(scenario)) {
        expect(text.trim(), path).not.toBe('')
        expect(ids.has(text), `${path} = '${text}'`).toBe(false)
        expect(text, path).not.toContain(`${definition.id}.`)
      }
      expect(scenario.hints).toHaveLength(3)
      expect(scenario.topics.length).toBeGreaterThanOrEqual(1)
      expect(warn).not.toHaveBeenCalled()
    },
  )
})

describe('ScenarioLocalizer', () => {
  it('keeps the data of the definition and does not mutate it', () => {
    const scenario = new ScenarioLocalizer(i18n.getFixedT('en')).localize(posGateway)
    expect(scenario.id).toBe(posGateway.id)
    expect(scenario.order).toBe(posGateway.order)
    expect(scenario.setting).toBe(posGateway.setting)
    expect(scenario.solvedWhen).toBe(posGateway.solvedWhen)
    expect(scenario.initialState.links).toBe(posGateway.initialState.links)
    expect(scenario.initialState.devices.map((device) => device.id)).toEqual(
      posGateway.initialState.devices.map((device) => device.id),
    )
    expect(posGateway.initialState.devices.find((device) => device.id === 'kasa')?.name).toBe('kasa')
  })

  it('follows the language of t', () => {
    const turkish = localizeScenario(posGateway, i18n.getFixedT('tr'))
    const english = localizeScenario(posGateway, i18n.getFixedT('en'))
    expect(turkish.title).toBe('Kasa internete çıkmıyor')
    expect(english.title).toBe('The POS terminal cannot reach the internet')
    expect(turkish.initialState.devices.find((device) => device.id === 'kasa')?.name).toBe('Kasa (POS)')
    expect(english.initialState.devices.find((device) => device.id === 'kasa')?.name).toBe('POS terminal')
  })

  it('warns and falls back to the ids when texts are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const unknown: ScenarioDefinition = { ...posGateway, id: 'unknownExercise' }
    const scenario = localizeScenario(unknown, i18n.getFixedT('en'))
    expect(scenario.title).toBe('unknownExercise')
    expect(scenario.hints).toEqual(['unknownExercise', 'unknownExercise', 'unknownExercise'])
    expect(scenario.topics).toEqual([])
    expect(scenario.initialState.devices.map((device) => device.name)).toEqual(
      posGateway.initialState.devices.map((device) => device.id),
    )
    expect(warn).toHaveBeenCalled()
  })

  it('falls back to the app link id when only a label is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const definition = scenarioDefinitions.find((candidate) => candidate.id === 'printerDhcp')
    expect(definition).toBeDefined()
    if (definition === undefined) return
    const withExtraLink: ScenarioDefinition = {
      ...definition,
      initialState: {
        ...definition.initialState,
        devices: definition.initialState.devices.map((device) =>
          device.id === 'muhasebe'
            ? {
                ...device,
                appLinks: [{ id: 'nas', label: 'nas', targetIp: '192.168.1.40', targetKind: 'pc' as const }],
              }
            : device,
        ),
      },
    }
    const muhasebe = localizeScenario(withExtraLink, i18n.getFixedT('en')).initialState.devices.find(
      (device) => device.id === 'muhasebe',
    )
    expect(muhasebe?.name).toBe('Accounting PC')
    expect(muhasebe?.appLinks?.[0]?.label).toBe('nas')
    expect(warn).toHaveBeenCalledOnce()
  })
})
