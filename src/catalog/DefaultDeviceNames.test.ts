import { describe, expect, it } from 'vitest'
import en from '../locales/en/catalog.json'
import tr from '../locales/tr/catalog.json'
import { DefaultDeviceNames, MODEL_NAME_BASES } from './DefaultDeviceNames'
import { findDeviceModel } from './DeviceCatalog'

describe('DefaultDeviceNames', () => {
  it('gives the smart TV and the modems their own name base, every other model its kind name', () => {
    expect(DefaultDeviceNames.modelBaseKey('smartTv')).toBe('catalog:defaultNames.smartTv')
    expect(DefaultDeviceNames.modelBaseKey('dslModem')).toBe('catalog:defaultNames.dslModem')
    expect(DefaultDeviceNames.modelBaseKey('cableModem')).toBe('catalog:defaultNames.cableModem')
    expect(DefaultDeviceNames.modelBaseKey('kitchenDisplay')).toBeNull()
    expect(DefaultDeviceNames.modelBaseKey('router2Port')).toBeNull()
  })

  it('names only catalog models and has their texts in tr and en', () => {
    for (const modelId of MODEL_NAME_BASES) {
      expect(findDeviceModel(modelId), modelId).toBeDefined()
      for (const resource of [en, tr]) {
        const names: Readonly<Record<string, string>> = resource.defaultNames
        expect(names[modelId]?.trim(), modelId).toBeTruthy()
      }
    }
  })

  it('numbers from 1 and skips names already in the lab', () => {
    const format = (number: number) => `Smart TV ${number}`
    expect(DefaultDeviceNames.firstFreeNumber(format, ['Kitchen display 1', 'Kitchen display 2'])).toBe(1)
    expect(DefaultDeviceNames.firstFreeNumber(format, ['Smart TV 1', 'smart tv 2 ', 'Smart TV 4'])).toBe(3)
  })
})
