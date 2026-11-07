import i18n from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { changeLanguage, currentLanguage, initI18n, localizedMessage, translateList, translateMessage } from './index'

describe('i18n runtime', () => {
  it('initializes with bundled resources and a supported detected language', async () => {
    await initI18n()
    // Node exposes navigator.language (the machine locale), so the result depends on the machine.
    expect(['tr', 'en']).toContain(currentLanguage())
    await changeLanguage('en')
    expect(i18n.t('common:appName')).toBe('Octetlab')
  })

  it('switches language and translates messages with params', async () => {
    await initI18n()
    await changeLanguage('tr')
    expect(currentLanguage()).toBe('tr')
    const message = localizedMessage('engine:unknownCommand', { command: 'tracert' })
    expect(translateMessage(i18n.t, message)).toContain("'tracert' komutu")
    await changeLanguage('en')
    expect(translateMessage(i18n.t, message)).toContain("'tracert' is not a recognized command")
  })

  it('returns [] for a key that is not a string list', async () => {
    await initI18n()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(translateList(i18n.t, 'common:appName')).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
