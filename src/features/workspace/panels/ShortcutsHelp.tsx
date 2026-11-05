import { X } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'

interface ShortcutsHelpProps {
  onClose: () => void
}

function Key({ children }: { children: string }) {
  return <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">{children}</kbd>
}

/** List of the workspace's keyboard shortcuts (opened with ? or the header button). */
function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  const { t } = useTranslation('workspace')
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  const ctrl = t('shortcuts.keys.ctrl')
  const shift = t('shortcuts.keys.shift')
  const rows: { keys: string[]; text: string }[] = [
    { keys: [ctrl, 'Z'], text: t('shortcuts.undo') },
    { keys: [ctrl, shift, 'Z'], text: t('shortcuts.redo') },
    { keys: [ctrl, 'Y'], text: t('shortcuts.redo') },
    { keys: [t('shortcuts.keys.del')], text: t('shortcuts.delete') },
    { keys: [t('shortcuts.keys.esc')], text: t('shortcuts.escape') },
    { keys: ['C'], text: t('shortcuts.cable') },
    { keys: [t('shortcuts.keys.enter')], text: t('shortcuts.connectFocused') },
    { keys: [t('shortcuts.keys.arrows')], text: t('shortcuts.nudge') },
    { keys: [shift, t('shortcuts.keys.arrows')], text: t('shortcuts.nudgeLarge') },
    { keys: [ctrl, 'A'], text: t('shortcuts.selectAll') },
    { keys: [shift, t('shortcuts.keys.click')], text: t('shortcuts.multiSelect') },
    { keys: [shift, t('shortcuts.keys.drag')], text: t('shortcuts.boxSelect') },
    { keys: ['?'], text: t('shortcuts.help') },
  ]

  return (
    <div
      role="dialog"
      aria-labelledby="shortcuts-heading"
      onKeyDown={handleKeyDown}
      className="absolute end-3 top-14 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="shortcuts-heading" className="font-semibold text-slate-900">
          {t('shortcuts.title')}
        </h2>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label={t('shortcuts.close')}
          className={`rounded p-1 text-slate-500 hover:bg-slate-100 ${focusRing}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <dl className="space-y-1.5 text-sm">
        {rows.map((row) => (
          <div key={`${row.keys.join('+')}-${row.text}`} className="flex items-center justify-between gap-3">
            <dt className="flex shrink-0 flex-wrap items-center gap-1">
              {row.keys.map((key) => (
                <Key key={key}>{key}</Key>
              ))}
            </dt>
            <dd className="text-end text-slate-700">{row.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default ShortcutsHelp
