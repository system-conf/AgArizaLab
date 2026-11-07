import { Search, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CableTool, DeviceModel, DeviceSubcategory } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { focusRing } from '../../shared/focusRing'
import { sectionOfModel, sectionsWithModels, subcategoriesWithModels } from '../labServices'
import CablePalette from './CablePalette'
import ModelDetailCard from './ModelDetailCard'
import ModelTileGrid from './ModelTileGrid'
import { PaletteSectionBar, SubcategoryTabs } from './PaletteNavigation'
import { isCatalogSection, usePaletteViewName, type PaletteView, type SubcategoryChoice } from './paletteViews'
import { usePaletteMemory } from './usePaletteMemory'
import { usePaletteTexts } from './usePaletteTexts'

interface DevicePaletteProps {
  models: readonly DeviceModel[]
  /** Click / Enter on a model: add it in the middle of the canvas. */
  onAdd: (modelId: string) => void
  /** A cable picked in the palette's Cables view (same tools as the canvas toolbar). */
  onChooseCable: (tool: CableTool) => void
  /** The active cable tool, null with the select tool. */
  activeCable: CableTool | null
  /** Design (D2): price text of a model (design brief with a budget); absent = no prices. */
  priceLabelOf?: (modelId: string) => string | undefined
}

interface TileGroup {
  key: string
  /** Heading of the group; absent when the view heading names it already. */
  title?: string
  models: readonly DeviceModel[]
}

/**
 * Device palette in two levels: section bar (network devices, end devices, cables, favourites,
 * recent) → sub-category filter → model tiles, with search and a details card. Drag a tile onto
 * the canvas or click it.
 */
function DevicePalette({ models, onAdd, onChooseCable, activeCable, priceLabelOf }: DevicePaletteProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const viewName = usePaletteViewName()
  const memory = usePaletteMemory()
  const texts = usePaletteTexts(models)
  const headingId = useId()
  const [view, setView] = useState<PaletteView>('network')
  const [subcategory, setSubcategory] = useState<SubcategoryChoice>('all')
  const [query, setQuery] = useState('')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const searching = query.trim().length > 0

  const byId = useMemo(() => new Map(models.map((model) => [model.id, model])), [models])
  const views = useMemo<readonly PaletteView[]>(() => [...sectionsWithModels(models), 'cables', 'favourites', 'recent'], [models])
  const subcategories: readonly DeviceSubcategory[] = isCatalogSection(view) ? subcategoriesWithModels(view, models) : []

  function modelsOf(ids: readonly string[]): DeviceModel[] {
    return ids.flatMap((id) => byId.get(id) ?? [])
  }

  function groups(): TileGroup[] {
    if (searching) return [{ key: 'results', models: modelsOf(texts.filter.search(query)) }]
    if (view === 'favourites') return [{ key: view, models: modelsOf(memory.favourites) }]
    if (view === 'recent') return [{ key: view, models: modelsOf(memory.recent) }]
    if (!isCatalogSection(view)) return []
    const inSection = models.filter((model) => sectionOfModel(model) === view)
    if (subcategory !== 'all') return [{ key: subcategory, models: inSection.filter((model) => model.subcategory === subcategory) }]
    return subcategories.map((choice) => ({
      key: choice,
      title: translate({ key: `catalog:subcategories.${choice}` }),
      models: inSection.filter((model) => model.subcategory === choice),
    }))
  }

  function selectView(next: PaletteView) {
    setView(next)
    setSubcategory('all')
    setQuery('')
  }

  function add(modelId: string) {
    memory.recordUse(modelId)
    onAdd(modelId)
  }

  const tileGroups = groups()
  const resultCount = tileGroups.reduce((sum, group) => sum + group.models.length, 0)
  const highlighted = highlightId === null ? null : (byId.get(highlightId) ?? null)
  const emptyText =
    searching ? t('palette.noResults', { query: query.trim() }) : view === 'favourites' ? t('palette.emptyFavourites') : t('palette.emptyRecent')

  return (
    <div className="flex flex-col gap-2">
      <PaletteSectionBar views={views} current={searching ? null : view} onSelect={selectView} />
      <div className="relative">
        <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || query === '') return
            // Clears the search first; a second Escape reaches the drawer / workspace.
            event.preventDefault()
            event.stopPropagation()
            setQuery('')
          }}
          aria-label={t('palette.search')}
          placeholder={t('palette.searchPlaceholder')}
          className={`w-full rounded-md border border-border-strong bg-surface py-1.5 ps-8 pe-8 text-sm text-fg-strong placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden ${focusRing}`}
        />
        {query !== '' && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('palette.clearSearch')}
            className={`absolute end-1 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg ${focusRing}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <h3 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {searching ? t('palette.resultCount', { count: resultCount }) : viewName(view)}
      </h3>
      <p className="sr-only" aria-live="polite">
        {searching ? t('palette.resultCount', { count: resultCount }) : ''}
      </p>
      {!searching && subcategories.length > 1 && (
        <SubcategoryTabs subcategories={subcategories} current={subcategory} onSelect={setSubcategory} />
      )}
      {!searching && view === 'cables' ? (
        <CablePalette activeTool={activeCable} onChoose={onChooseCable} />
      ) : (
        <>
          <p className="text-xs text-fg-subtle">{t('palette.hint')}</p>
          <p className="hidden text-xs text-fg-subtle pointer-coarse:block">{t('palette.touchHint')}</p>
          {resultCount === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-fg-subtle">{emptyText}</p>
          ) : (
            tileGroups.map((group) => (
              <section key={group.key} aria-labelledby={group.title === undefined ? headingId : `${headingId}-${group.key}`}>
                {group.title !== undefined && (
                  <h4 id={`${headingId}-${group.key}`} className="mb-1 text-xs font-medium text-fg-subtle">
                    {group.title}
                  </h4>
                )}
                <ModelTileGrid
                  models={group.models}
                  textOf={texts.textOf}
                  favourites={memory.favourites}
                  onAdd={add}
                  onDropped={memory.recordUse}
                  onHighlight={setHighlightId}
                  priceLabelOf={priceLabelOf}
                />
              </section>
            ))
          )}
          <p className="sr-only">{t('palette.gridHint')}</p>
          <ModelDetailCard
            model={highlighted}
            text={highlightId === null ? undefined : texts.textOf(highlightId)}
            favourite={highlightId !== null && memory.favourites.includes(highlightId)}
            onToggleFavourite={memory.toggleFavourite}
            price={highlightId === null ? undefined : priceLabelOf?.(highlightId)}
          />
        </>
      )}
    </div>
  )
}

export default DevicePalette
