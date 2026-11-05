import { describe, expect, it } from 'vitest'
import { isLanguageCode, languageInfo, languages, toSupportedLanguage } from './languages'

describe('languages', () => {
  it('has unique codes', () => {
    const codes = languages.map((language) => language.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('maps browser and URL codes to supported languages', () => {
    expect(toSupportedLanguage('tr')).toBe('tr')
    expect(toSupportedLanguage('tr-TR')).toBe('tr')
    expect(toSupportedLanguage('TR_tr')).toBe('tr')
    expect(toSupportedLanguage('en-GB')).toBe('en')
  })

  it('leaves unsupported codes unchanged so i18next can fall back', () => {
    expect(toSupportedLanguage('de-DE')).toBe('de-DE')
    expect(isLanguageCode('de-DE')).toBe(false)
  })

  it('gives direction info per language', () => {
    expect(languageInfo('tr')).toEqual({ code: 'tr', nativeName: 'Türkçe', dir: 'ltr' })
  })
})
