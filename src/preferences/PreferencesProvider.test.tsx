import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PreferencesProvider from './PreferencesProvider'
import { PreferencesStore } from './PreferencesStore'
import { memoryStorage } from './testStorage'
import { usePreference, usePreferences, usePreferencesStore } from './usePreferences'

function Probe() {
  const preferences = usePreferences()
  const [labels] = usePreference('map.deviceLabels')
  const store = usePreferencesStore()
  return <output>{`${preferences.appearance.theme}|${labels}|${store.get('map.snap')}`}</output>
}

describe('PreferencesProvider', () => {
  it('hands its store to the hooks', () => {
    const store = new PreferencesStore(memoryStorage())
    store.update({ appearance: { theme: 'dark' }, map: { deviceLabels: 'both', snap: true } })
    const html = renderToString(
      <PreferencesProvider store={store}>
        <Probe />
      </PreferencesProvider>,
    )
    expect(html).toContain('dark|both|true')
  })
})
