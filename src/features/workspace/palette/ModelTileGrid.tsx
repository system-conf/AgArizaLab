import { Star } from 'lucide-react'
import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeviceModel } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import { DeviceKindIcon } from '../labServices'
import { MODEL_DRAG_TYPE } from '../workspaceConstants'
import { GridNavigation, isGridKey } from './GridNavigation'
import type { PaletteModelText } from './usePaletteTexts'

interface ModelTileGridProps {
  models: readonly DeviceModel[]
  textOf: (modelId: string) => PaletteModelText | undefined
  favourites: readonly string[]
  /** Click / Enter: add the model in the middle of the canvas. */
  onAdd: (modelId: string) => void
  /** The model was dropped on the canvas (drag ended with a copy). */
  onDropped: (modelId: string) => void
  /** Pointer or keyboard focus is on this model (shown in the details card). */
  onHighlight: (modelId: string) => void
}

/** Number of columns the grid is laid out in right now (from the computed CSS grid). */
function columnsOf(list: HTMLElement | null): number {
  if (list === null) return 1
  return getComputedStyle(list).gridTemplateColumns.split(' ').filter((track) => track.length > 0).length
}

/**
 * Model tiles: drag one onto the canvas or click it. One tab stop per grid (roving focus); arrow
 * keys move between tiles, Home / End jump, Enter / Space add the focused model.
 */
function ModelTileGrid({ models, textOf, favourites, onAdd, onDropped, onHighlight }: ModelTileGridProps) {
  const { t } = useTranslation('workspace')
  const listRef = useRef<HTMLUListElement>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const describedByPrefix = useId()
  const current = Math.min(focusIndex, Math.max(0, models.length - 1))

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (!isGridKey(event.key)) return
    event.preventDefault()
    const rtl = listRef.current !== null && getComputedStyle(listRef.current).direction === 'rtl'
    const next = GridNavigation.next(current, event.key, models.length, columnsOf(listRef.current), rtl)
    setFocusIndex(next)
    listRef.current?.querySelectorAll<HTMLButtonElement>('[data-palette-tile]')[next]?.focus()
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, modelId: string) {
    event.dataTransfer.setData(MODEL_DRAG_TYPE, modelId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  function handleDragEnd(event: DragEvent<HTMLButtonElement>, modelId: string) {
    if (event.dataTransfer.dropEffect !== 'none') onDropped(modelId)
  }

  return (
    <ul ref={listRef} onKeyDown={handleKeyDown} className="grid grid-cols-3 gap-1 md:grid-cols-2">
      {models.map((model, index) => {
        const text = textOf(model.id)
        const name = text?.name ?? model.id
        const favourite = favourites.includes(model.id)
        const describedBy = `${describedByPrefix}-${model.id}`
        return (
          <li key={model.id} className="relative">
            <button
              type="button"
              data-palette-tile
              draggable
              tabIndex={index === current ? 0 : -1}
              onDragStart={(event) => handleDragStart(event, model.id)}
              onDragEnd={(event) => handleDragEnd(event, model.id)}
              onClick={() => onAdd(model.id)}
              onFocus={() => {
                setFocusIndex(index)
                onHighlight(model.id)
              }}
              onMouseEnter={() => onHighlight(model.id)}
              aria-label={t('palette.add', { name })}
              aria-describedby={describedBy}
              className={`flex h-full w-full cursor-grab flex-col items-center gap-1 rounded-lg border border-transparent p-2 text-center text-xs leading-tight text-slate-700 hover:border-sky-200 hover:bg-sky-50 active:cursor-grabbing ${focusRing}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                <DeviceKindIcon kind={model.kind} modelId={model.id} className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="line-clamp-2">{name}</span>
              <span id={describedBy} className="sr-only">
                {favourite && <span>{t('palette.isFavourite')}. </span>}
                {text?.ports}
              </span>
            </button>
            {favourite && (
              <Star className="pointer-events-none absolute end-1 top-1 h-3 w-3 fill-amber-400 text-amber-500" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default ModelTileGrid
