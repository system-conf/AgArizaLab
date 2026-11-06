import { useTranslation } from 'react-i18next'
import type { CableTool } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import CableGlyph from '../cable/CableGlyph'

/** Cable tools in palette order (the same tools and order as the canvas toolbar). */
const PALETTE_CABLE_TOOLS: readonly CableTool[] = [
  'auto',
  'copperStraight',
  'copperCross',
  'fiber',
  'serial',
  'console',
  'coaxial',
  'wireless',
]

interface CablePaletteProps {
  activeTool: CableTool | null
  onChoose: (tool: CableTool) => void
}

/** The cable tools as a palette list with a line on when to use each (the toolbar stays a shortcut). */
function CablePalette({ activeTool, onChoose }: CablePaletteProps) {
  const { t } = useTranslation('workspace')
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{t('palette.cableHint')}</p>
      <ul className="space-y-1">
        {PALETTE_CABLE_TOOLS.map((tool) => {
          const name = t(`cableTools.${tool}`)
          const pressed = activeTool === tool
          return (
            <li key={tool}>
              <button
                type="button"
                onClick={() => onChoose(tool)}
                aria-pressed={pressed}
                aria-label={t('palette.useCable', { name })}
                className={`flex w-full items-start gap-2 rounded-lg border p-2 text-start text-xs ${
                  pressed ? 'border-sky-300 bg-sky-50' : 'border-transparent hover:border-sky-200 hover:bg-sky-50'
                } ${focusRing}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700">
                  <CableGlyph tool={tool} />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">{name}</span>
                  <span className="block text-slate-500">{t(`palette.cableDescriptions.${tool}`)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default CablePalette
