import { useTranslation } from 'react-i18next'
import { useLanguage, useMessageTranslator } from '../../../i18n'
import { EVENT_FILTER_PROTOCOLS, SIMULATION_MODES, usePreference } from '../../../preferences'
import { SimMessages } from '../../../sim/contract/SimMessages'
import { PLAY_SPEEDS } from '../../../sim/contract/SimulationView'
import { focusRing } from '../../shared/focusRing'
import ChoiceGroup from '../controls/ChoiceGroup'
import { FIELD_LIST } from '../controls/fieldList'
import SwitchField from '../controls/SwitchField'

/** The chosen protocols with `protocol` switched on or off, in chip order. */
function toggled(list: readonly string[], protocol: (typeof EVENT_FILTER_PROTOCOLS)[number]) {
  const on = list.includes(protocol)
  return EVENT_FILTER_PROTOCOLS.filter((candidate) => (candidate === protocol ? !on : list.includes(candidate)))
}

/** Animation & simulation: packet animation, playback speed, start mode and the event list's starting filter. */
function SimulationSection() {
  const { t } = useTranslation(['preferences', 'simulation'])
  const translate = useMessageTranslator()
  const { language } = useLanguage()
  const [animation, setAnimation] = usePreference('simulation.animation')
  const [speed, setSpeed] = usePreference('simulation.speed')
  const [defaultMode, setDefaultMode] = usePreference('simulation.defaultMode')
  const [filters, setFilters] = usePreference('simulation.defaultEventFilters')
  const number = new Intl.NumberFormat(language)
  const allOn = filters.length === EVENT_FILTER_PROTOCOLS.length

  return (
    <div className={FIELD_LIST}>
      <SwitchField label={t('simulation.animation.label')} hint={t('simulation.animation.hint')} checked={animation} onChange={setAnimation} />
      <ChoiceGroup
        label={t('simulation.speed.label')}
        choices={PLAY_SPEEDS.map((value) => ({ value, label: t('simulation:ui.controls.speedValue', { speed: number.format(value) }) }))}
        value={speed}
        onChange={setSpeed}
      />
      <ChoiceGroup
        label={t('simulation.defaultMode.label')}
        hint={t('simulation.defaultMode.hint')}
        choices={SIMULATION_MODES.map((value) => ({ value, label: t(`simulation.defaultMode.${value}`) }))}
        value={defaultMode}
        onChange={setDefaultMode}
      />
      <div>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">
            {t('simulation.defaultEventFilters.label')}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilters(allOn ? [] : EVENT_FILTER_PROTOCOLS)}
              className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium text-accent-text ring-1 ring-border-strong hover:bg-accent-muted ${focusRing}`}
            >
              {allOn ? t('simulation.defaultEventFilters.none') : t('simulation.defaultEventFilters.all')}
            </button>
            {EVENT_FILTER_PROTOCOLS.map((protocol) => {
              const on = filters.includes(protocol)
              return (
                <label
                  key={protocol}
                  className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                    on ? 'border-accent bg-accent-muted text-accent-text' : 'border-border-strong bg-surface text-fg-muted'
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => setFilters(toggled(filters, protocol))} className="h-4 w-4 accent-accent" />
                  {translate(SimMessages.protocol(protocol))}
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>
    </div>
  )
}

export default SimulationSection
