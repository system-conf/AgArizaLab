import { Keyboard, Redo2, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../layout/LanguageSwitcher'
import { focusRing } from '../shared/focusRing'

interface WorkspaceHeaderProps {
  /** Start of the bar: home link, lab title and File menu (lab) or back link and exercise title. */
  start: ReactNode
  /** After the language switcher, e.g. the exercise's Guide button. */
  end?: ReactNode
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  shortcutsOpen: boolean
  onToggleShortcuts: () => void
}

export function HeaderButton({ label, onClick, disabled, pressed, children }: {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
    >
      {children}
    </button>
  )
}

/** Top bar of the workspace: the screen's own start content, undo / redo, shortcuts help, language. */
function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { t } = useTranslation('workspace')
  return (
    <header className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-2 sm:gap-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">{props.start}</div>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <HeaderButton label={t('header.undo')} onClick={props.onUndo} disabled={!props.canUndo}>
          <Undo2 className="h-5 w-5" aria-hidden="true" />
        </HeaderButton>
        <HeaderButton label={t('header.redo')} onClick={props.onRedo} disabled={!props.canRedo}>
          <Redo2 className="h-5 w-5" aria-hidden="true" />
        </HeaderButton>
        <span className="hidden sm:contents">
          <HeaderButton label={t('header.shortcuts')} onClick={props.onToggleShortcuts} pressed={props.shortcutsOpen}>
            <Keyboard className="h-5 w-5" aria-hidden="true" />
          </HeaderButton>
        </span>
        <LanguageSwitcher />
        {props.end}
      </div>
    </header>
  )
}

export default WorkspaceHeader
