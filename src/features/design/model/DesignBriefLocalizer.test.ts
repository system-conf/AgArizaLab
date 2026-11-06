import { createInstance, type i18n as I18n } from 'i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import enBriefs from '../../../locales/en/designBriefs.json'
import trBriefs from '../../../locales/tr/designBriefs.json'
import { officeBrief } from '../../../design/testBriefs'
import { designExercises } from '../../../scenarios/design'
import { DesignBriefLocalizer } from './DesignBriefLocalizer'

let i18n: I18n

beforeAll(async () => {
  i18n = createInstance()
  await i18n.init({
    resources: { tr: { designBriefs: trBriefs }, en: { designBriefs: enBriefs } },
    lng: 'tr',
    fallbackLng: false,
    ns: ['designBriefs'],
    interpolation: { escapeValue: false },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DesignBriefLocalizer', () => {
  it.each(['tr', 'en'])('fills every name and text of every brief in %s', (language) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const localizer = new DesignBriefLocalizer(i18n.getFixedT(language))
    for (const definition of designExercises) {
      const brief = localizer.localize(definition)
      expect(brief.texts.title).not.toBe(definition.id)
      expect(brief.texts.customer.message).not.toBe(definition.id)
      expect(brief.texts.reference.presentation).not.toBe(definition.id)
      expect(brief.texts.topics.length).toBeGreaterThan(0)
      for (const device of [...brief.lab.state.devices, ...brief.reference.state.devices]) expect(device.name).not.toBe(device.id)
      for (const group of brief.groups) expect(group.name).not.toBe(group.id)
      for (const zone of brief.lab.annotations) if (zone.type === 'rectangle') expect(zone.label).not.toBe(zone.id)
    }
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps the requirements and falls back to ids for missing texts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const definition = officeBrief()
    const brief = new DesignBriefLocalizer(i18n.getFixedT('en')).localize(definition)
    expect(brief.texts.title).toBe('testOffice')
    expect(brief.texts.topics).toEqual([])
    expect(brief.lab.state.devices.map((device) => device.name)).toEqual(definition.lab.state.devices.map((device) => device.name))
    expect(brief.requirements).toBe(definition.requirements)
    expect(warn).toHaveBeenCalled()
  })
})
