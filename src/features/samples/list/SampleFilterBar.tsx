import { Search, X } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { SampleFeature, SampleLevel } from '../../../samples'
import { focusRing } from '../../shared/focusRing'
import { EMPTY_SAMPLE_FILTER, SampleListModel, type SampleListFilter } from '../model/SampleListModel'

interface SampleFilterBarProps {
  filter: SampleListFilter
  levels: readonly SampleLevel[]
  features: readonly SampleFeature[]
  onChange: (filter: SampleListFilter) => void
}

interface ChipProps {
  label: string
  pressed: boolean
  onToggle: () => void
}

function Chip({ label, pressed, onToggle }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${
        pressed ? 'bg-teal-700 text-white ring-teal-700' : 'bg-surface text-fg ring-border-strong hover:bg-surface-subtle'
      } ${focusRing}`}
    >
      {label}
    </button>
  )
}

/** Search field plus level and required-feature chips of the sample list. */
function SampleFilterBar({ filter, levels, features, onChange }: SampleFilterBarProps) {
  const { t } = useTranslation('samples')
  const searchId = useId()
  const levelLabelId = useId()
  const featureLabelId = useId()

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="text-sm font-medium text-fg">
          {t('ui.list.searchLabel')}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={filter.query}
            onChange={(event) => onChange({ ...filter, query: event.target.value })}
            placeholder={t('ui.list.searchPlaceholder')}
            autoComplete="off"
            enterKeyHint="search"
            className={`w-full rounded-lg border border-border-strong bg-surface py-2 pe-3 ps-9 text-sm text-fg-strong ${focusRing}`}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {levels.length > 1 && (
          <div role="group" aria-labelledby={levelLabelId} className="flex flex-wrap items-center gap-1.5">
            <span id={levelLabelId} className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {t('ui.list.levelFilter')}
            </span>
            {levels.map((level) => (
              <Chip
                key={level}
                label={t(`levels.${level}`)}
                pressed={filter.levels.includes(level)}
                onToggle={() => onChange({ ...filter, levels: SampleListModel.toggle(filter.levels, level) })}
              />
            ))}
          </div>
        )}
        {features.length > 0 && (
          <div role="group" aria-labelledby={featureLabelId} className="flex flex-wrap items-center gap-1.5">
            <span id={featureLabelId} className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {t('ui.list.featureFilter')}
            </span>
            {features.map((feature) => (
              <Chip
                key={feature}
                label={t(`features.${feature}`)}
                pressed={filter.features.includes(feature)}
                onToggle={() => onChange({ ...filter, features: SampleListModel.toggle(filter.features, feature) })}
              />
            ))}
          </div>
        )}
        {SampleListModel.isFiltered(filter) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_SAMPLE_FILTER)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-fg-muted hover:bg-surface-muted ${focusRing}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t('ui.list.clearFilters')}
          </button>
        )}
      </div>
    </div>
  )
}

export default SampleFilterBar
