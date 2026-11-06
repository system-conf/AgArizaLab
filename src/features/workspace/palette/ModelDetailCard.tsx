import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DeviceModel } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import { DeviceKindIcon } from '../labServices'
import type { PaletteModelText } from './usePaletteTexts'

interface ModelDetailCardProps {
  /** The hovered / focused model; null before the first one. */
  model: DeviceModel | null
  text: PaletteModelText | undefined
  favourite: boolean
  onToggleFavourite: (modelId: string) => void
}

/**
 * Details of the model under the pointer or keyboard focus: port summary, short description,
 * "when to use it" and the favourite star. Sticks to the bottom of the palette while it scrolls.
 */
function ModelDetailCard({ model, text, favourite, onToggleFavourite }: ModelDetailCardProps) {
  const { t } = useTranslation('workspace')
  return (
    <section
      aria-label={t('palette.details')}
      // The pointer hint means nothing on touch screens (a tap adds the device): wide screens only.
      className={`sticky bottom-0 -mx-3 -mb-3 ${model === null ? 'hidden md:block' : ''} border-t border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 backdrop-blur`}
    >
      {model === null || text === undefined ? (
        <p>{t('palette.detailsHint')}</p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <DeviceKindIcon kind={model.kind} modelId={model.id} className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-tight text-slate-900">{text.name}</h3>
            <button
              type="button"
              onClick={() => onToggleFavourite(model.id)}
              aria-pressed={favourite}
              aria-label={t(favourite ? 'palette.unfavourite' : 'palette.favourite', { name: text.name })}
              title={t(favourite ? 'palette.unfavourite' : 'palette.favourite', { name: text.name })}
              className={`-me-1 -mt-1 shrink-0 rounded p-1 hover:bg-amber-50 ${favourite ? 'text-amber-500' : 'text-slate-400'} ${focusRing}`}
            >
              <Star className={`h-4 w-4 ${favourite ? 'fill-amber-400' : ''}`} aria-hidden="true" />
            </button>
          </div>
          <p className="font-medium text-slate-700">{text.ports}</p>
          <p>{text.description}</p>
          <p className="font-semibold text-slate-700">{t('palette.useCase')}</p>
          <p>{text.useCase}</p>
        </div>
      )}
    </section>
  )
}

export default ModelDetailCard
