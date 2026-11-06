import { useMemo, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeviceModel } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { focusRing } from '../../shared/focusRing'
import { DEVICE_CATEGORIES, DeviceKindIcon } from '../labServices'
import { MODEL_DRAG_TYPE } from '../workspaceConstants'


interface DevicePaletteProps {
  models: readonly DeviceModel[]
  /** Click / Enter on a model: add it in the middle of the canvas. */
  onAdd: (modelId: string) => void
}

/** Device models grouped by category; drag one onto the canvas or click it. */
function DevicePalette({ models, onAdd }: DevicePaletteProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const groups = useMemo(
    () =>
      DEVICE_CATEGORIES.map((category) => ({ category, models: models.filter((model) => model.category === category) })).filter(
        (group) => group.models.length > 0,
      ),
    [models],
  )

  function handleDragStart(event: DragEvent<HTMLButtonElement>, modelId: string) {
    event.dataTransfer.setData(MODEL_DRAG_TYPE, modelId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{t('palette.hint')}</p>
      {groups.map((group) => (
        <section key={group.category} aria-labelledby={`palette-${group.category}`}>
          <h3 id={`palette-${group.category}`} className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t(`palette.categories.${group.category}`)}
          </h3>
          <ul className="grid grid-cols-3 gap-1 md:grid-cols-2">
            {group.models.map((model) => {
              const name = translate({ key: model.nameKey })
              return (
                <li key={model.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleDragStart(event, model.id)}
                    onClick={() => onAdd(model.id)}
                    aria-label={t('palette.add', { name })}
                    title={name}
                    className={`flex h-full w-full cursor-grab flex-col items-center gap-1 rounded-lg border border-transparent p-2 text-center text-xs leading-tight text-slate-700 hover:border-sky-200 hover:bg-sky-50 active:cursor-grabbing ${focusRing}`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                      <DeviceKindIcon kind={model.kind} className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="line-clamp-2">{name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default DevicePalette
