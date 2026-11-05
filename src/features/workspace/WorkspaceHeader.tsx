import { Keyboard, Network, Redo2, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../layout/LanguageSwitcher'
import { focusRing } from '../shared/focusRing'
import CommitField from './panels/CommitField'

interface WorkspaceHeaderProps {
  title: string
  onTitle: (title: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  shortcutsOpen: boolean
  onToggleShortcuts: () => void
}

function HeaderButton({ label, onClick, disabled, pressed, children }: {
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

/** Lab title (editable), undo / redo, shortcuts help and the language switcher. */
function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { t } = useTranslation(['workspace', 'lab'])
  return (
    <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <Network className="hidden h-6 w-6 shrink-0 text-sky-600 sm:block" aria-hidden="true" />
      <CommitField
        label={t('header.titleLabel')}
        value={props.title}
        onCommit={props.onTitle}
        placeholder={t('lab:untitled')}
        hideLabel
        className="min-w-0 max-w-md flex-1"
      />
      <div className="ms-auto flex items-center gap-1">
        <HeaderButton label={t('header.undo')} onClick={props.onUndo} disabled={!props.canUndo}>
          <Undo2 className="h-5 w-5" aria-hidden="true" />
        </HeaderButton>
        <HeaderButton label={t('header.redo')} onClick={props.onRedo} disabled={!props.canRedo}>
          <Redo2 className="h-5 w-5" aria-hidden="true" />
        </HeaderButton>
        <HeaderButton label={t('header.shortcuts')} onClick={props.onToggleShortcuts} pressed={props.shortcutsOpen}>
          <Keyboard className="h-5 w-5" aria-hidden="true" />
        </HeaderButton>
        <LanguageSwitcher />
      </div>
    </header>
  )
}

export default WorkspaceHeader
