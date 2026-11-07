import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { focusRing } from '../../shared/focusRing'

interface RowListProps<Item> {
  items: readonly Item[]
  keyOf: (item: Item) => string
  titleOf: (item: Item, index: number) => string
  renderRow: (item: Item, index: number) => ReactNode
  addLabel: string
  onAdd: () => void
  removeLabelOf: (item: Item, index: number) => string
  onRemove: (index: number) => void
  /** Rows that cannot be removed (e.g. VLAN 1) get no remove button. */
  canRemove?: (item: Item) => boolean
  /** Shown when there are no rows. */
  emptyText?: string
}

/** Editable list of rows (VLANs, routes, pools…): one card per row, remove buttons, an add button. */
function RowList<Item>({ items, keyOf, titleOf, renderRow, addLabel, onAdd, removeLabelOf, onRemove, canRemove, emptyText }: RowListProps<Item>) {
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && emptyText && <p className="text-sm text-fg-subtle">{emptyText}</p>}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => {
            const title = titleOf(item, index)
            return (
              <li key={keyOf(item)} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-subtle/60 p-2.5">
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <h4 className="min-w-0 truncate text-sm font-medium text-fg">{title}</h4>
                  {(canRemove?.(item) ?? true) && (
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      aria-label={removeLabelOf(item, index)}
                      title={removeLabelOf(item, index)}
                      className={`rounded-md p-1.5 text-fg-subtle hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 disabled:hidden ${focusRing}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {renderRow(item, index)}
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className={`flex items-center gap-1.5 self-start rounded-md border border-dashed border-border-strong px-3 py-1.5 text-sm text-sky-800 dark:text-sky-200 hover:bg-accent-muted disabled:hidden ${focusRing}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  )
}

export default RowList
