import { Eraser, Lock, SquareTerminal } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalizedMessage } from '../../domain/Messages'
import type { Device, NetworkState, TerminalLine } from '../../domain'
import { useMessageTranslator } from '../../i18n'
import { usePreference } from '../../preferences'
import { terminalFontStyle } from '../preferences/model/preferenceWiring'
import { focusRing } from '../shared/focusRing'
import type { CliControlKey, ExerciseLockPolicy } from './cliServices'
import { CliAccess } from './model/CliAccess'
import { useCliConsole } from './useCliConsole'

export interface CliConsoleTabProps {
  /** Storage id of the open lab: another lab starts with fresh consoles. */
  labId: string
  device: Device
  network: NetworkState
  policy: ExerciseLockPolicy
  onUpdate: (next: Device) => void
  /** Why the lab refused the last change of this device ([] = none). */
  problems: readonly LocalizedMessage[]
}

/** Console text reads left to right in every UI language, like on a real device. */
const consoleDirection = 'ltr'

const lineColors: Record<TerminalLine['kind'], string> = {
  input: 'text-[#f2f2f2]',
  output: 'text-[#cccccc]',
  error: 'text-[#ff8f8f]',
  info: 'text-[#9fd3ff]',
}

const CONTROL_KEYS: Readonly<Partial<Record<string, CliControlKey>>> = { z: 'ctrlZ', c: 'ctrlC' }

/** Keys that alone do nothing at ` --More-- ` (Tab still moves the focus on). */
const PASSIVE_KEYS: ReadonlySet<string> = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/**
 * "CLI" tab of routers and managed switches: the device's console line (docs/CLI.md §4) in an IOS
 * look-alike window. Enter submits, `?` lists help, Tab completes, Up / Down walk the history, Ctrl+Z
 * leaves config mode, Ctrl+C cancels; at ` --More-- ` Space pages, Enter adds a line, other keys stop.
 * Device text is shown verbatim (English); app hints follow the UI language.
 */
function CliConsoleTab({ labId, device, network, policy, onUpdate, problems }: CliConsoleTabProps) {
  const { t } = useTranslation('cli')
  const translateMessage = useMessageTranslator()
  const controls = useCliConsole({ labId, device, network, policy, onUpdate })
  const screen = controls.console
  const [input, setInput] = useState('')
  // Position while browsing history with the arrow keys; null = editing a new line.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const kind = screen.input
  const readOnly = CliAccess.readOnly(device, policy)
  // PU (Preferences → Terminal / CLI): text size (phones keep 16 px in the input, so iOS does not zoom).
  const [fontSize] = usePreference('terminal.fontSize')

  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [screen])

  function reset(next: string) {
    setInput(next)
    setHistoryIndex(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (kind === 'more') return controls.pagerKey('enter')
    if (kind === 'busy') return
    controls.submit(input)
    reset('')
  }

  function browseHistory(step: -1 | 1) {
    const history = controls.history()
    if (history.length === 0) return
    if (step < 0) {
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(next)
      setInput(history[next] ?? '')
    } else if (historyIndex !== null) {
      const next = historyIndex + 1
      setHistoryIndex(next >= history.length ? null : next)
      setInput(next >= history.length ? '' : (history[next] ?? ''))
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const control = event.ctrlKey && !event.altKey && !event.metaKey ? CONTROL_KEYS[event.key.toLowerCase()] : undefined
    const field = event.currentTarget
    // Ctrl+C with selected text copies it.
    if (control !== undefined && !(control === 'ctrlC' && field.selectionStart !== field.selectionEnd)) {
      event.preventDefault()
      controls.control(control, input)
      return reset('')
    }
    if (kind === 'more') {
      if (PASSIVE_KEYS.has(event.key)) return
      event.preventDefault()
      if (event.key === ' ') controls.pagerKey('space')
      else if (event.key === 'Enter') controls.pagerKey('enter')
      else controls.pagerKey('quit')
      return
    }
    if (kind !== 'command') return
    if (event.key === '?') {
      event.preventDefault()
      reset(controls.help(input))
    } else if (event.key === 'Tab' && !event.shiftKey && input.trim() !== '') {
      // On an empty line Tab moves the focus on (no keyboard trap).
      event.preventDefault()
      reset(controls.complete(input))
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      browseHistory(event.key === 'ArrowUp' ? -1 : 1)
    }
  }

  /** Phones send no usable key codes: text typed at ` --More-- ` pages (a space) or stops. */
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value
    if (kind === 'more') {
      if (text !== '') controls.pagerKey(text.includes(' ') ? 'space' : 'quit')
      return
    }
    if (kind !== 'busy') reset(text)
  }

  function lineText(line: TerminalLine): string {
    return line.message !== undefined ? translateMessage(line.message) : line.text
  }

  // Click anywhere in the window to type, unless the user is selecting output text.
  function focusInput() {
    if (window.getSelection()?.toString()) return
    inputRef.current?.focus()
  }

  let hint = t('hints.help')
  if (kind === 'more') hint = t('hints.more')
  else if (kind === 'busy') hint = t('busy')

  return (
    <div className="flex flex-col gap-2">
      {readOnly && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('ui.readOnly')}
        </p>
      )}
      <div className="flex h-80 flex-col overflow-hidden rounded-lg border border-slate-400 bg-black shadow-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus md:h-[28rem]">
        <div className="flex items-center gap-2 bg-surface-muted px-2 py-1 text-xs text-fg">
          <SquareTerminal className="h-4 w-4 text-fg-muted" aria-hidden="true" />
          <span className="flex-1 truncate">{t('ui.windowTitle', { name: device.name })}</span>
          <button
            type="button"
            onClick={() => {
              controls.clear()
              inputRef.current?.focus()
            }}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-strong ${focusRing}`}
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
            {t('ui.clear')}
          </button>
        </div>
        <div
          ref={scrollRef}
          dir={consoleDirection}
          onClick={focusInput}
          style={terminalFontStyle(fontSize)}
          className="flex-1 cursor-text overflow-y-auto px-3 py-2 font-console text-(length:--terminal-font-size) leading-snug"
        >
          <div role="log" aria-live="polite" aria-label={t('ui.outputLabel')}>
            {screen.lines.map((line, index) => (
              // The transcript grows at its end (and drops its oldest lines), so the index is a fair key.
              <pre key={index} className={`min-h-[1lh] whitespace-pre-wrap break-words font-console ${lineColors[line.kind]}`}>
                {lineText(line)}
              </pre>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="flex items-center text-[#f2f2f2]">
            <label htmlFor={inputId} className="shrink-0 whitespace-pre">
              {screen.prompt}
              <span className="sr-only"> {t('ui.inputLabel')}</span>
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type={kind === 'secret' ? 'password' : 'text'}
              value={kind === 'more' ? '' : input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              readOnly={kind === 'busy'}
              aria-describedby={hintId}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              className="min-w-0 flex-1 bg-transparent p-0 font-console text-base md:text-(length:--terminal-font-size) text-[#f2f2f2] caret-[#f2f2f2] outline-none"
            />
          </form>
        </div>
      </div>
      <p id={hintId} className="text-xs text-fg-subtle">
        {hint}
      </p>
      {problems.length > 0 && (
        <div role="alert" className="rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
          <p className="font-medium">{t('ui.problems')}</p>
          <ul className="list-disc ps-5">
            {problems.map((problem, index) => (
              <li key={index}>{translateMessage(problem)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default CliConsoleTab
