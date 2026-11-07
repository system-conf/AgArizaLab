import { describe, expect, it, vi } from 'vitest'
import { PreferencesDialogState } from './preferencesDialogState'

describe('PreferencesDialogState', () => {
  it('opens and closes, telling subscribers only about real changes', () => {
    const state = new PreferencesDialogState()
    const listener = vi.fn()
    const unsubscribe = state.subscribe(listener)
    expect(state.isOpen()).toBe(false)
    state.show()
    state.show()
    expect(state.isOpen()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    state.hide()
    expect(state.isOpen()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    state.show()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps its methods bound (they are passed as event handlers)', () => {
    const state = new PreferencesDialogState()
    const { show, hide, isOpen } = state
    show()
    expect(isOpen()).toBe(true)
    hide()
    expect(isOpen()).toBe(false)
  })
})
