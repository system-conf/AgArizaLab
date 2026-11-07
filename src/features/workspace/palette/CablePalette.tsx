import { useTranslation } from 'react-i18next'
import type { CableTool } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import CableGlyph from '../cable/CableGlyph'
import { useOfferedCableTools } from '../cable/useOfferedCableTools'

interface CablePaletteProps {
  activeTool: CableTool | null
  onChoose: (tool: CableTool) => void
}

/** The cable tools as a palette list with a line on when to use each (the toolbar stays a shortcut). */
function CablePalette({ activeTool, onChoose }: CablePaletteProps) {
  const { t } = useTranslation('workspace')
  const cableTools = useOfferedCableTools()
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-subtle">{t('palette.cableHint')}</p>
      <ul className="space-y-1">
        {cableTools.map((tool) => {
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
                  pressed ? 'border-sky-300 dark:border-sky-700 bg-accent-muted' : 'border-transparent hover:border-sky-200 dark:hover:border-sky-800 hover:bg-accent-muted'
                } ${focusRing}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-fg">
                  <CableGlyph tool={tool} />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-fg">{name}</span>
                  <span className="block text-fg-subtle">{t(`palette.cableDescriptions.${tool}`)}</span>
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
