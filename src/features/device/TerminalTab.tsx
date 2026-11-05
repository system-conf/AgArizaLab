import { Eraser, SquareTerminal } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { TerminalLine } from '../../domain/EngineContract'
import { focusRing } from '../shared/focusRing'

interface TerminalTabProps {
  lines: TerminalLine[]
  onRunCommand: (line: string) => void
  /** Lines hidden by `cls` (counted from the start); defaults to 0. */
  hiddenLineCount?: number
  /** Called for `cls` / the clear button. Without it, `cls` is passed to onRunCommand. */
  onClear?: () => void
}

const prompt = 'C:\\>'

// Classic cmd.exe palette: light grey on black.
const lineColors: Record<TerminalLine['kind'], string> = {
  input: 'text-[#f2f2f2]',
  output: 'text-[#cccccc]',
  error: 'text-[#ff8f8f]',
  info: 'text-[#9fd3ff]',
}

/**
 * "Terminal" tab: a Windows command prompt look-alike. The component does not echo commands
 * itself; the caller appends an 'input' line (raw command text) plus the output lines.
 * `cls` is handled here (UI only): it hides the lines on screen, the session keeps them.
 */
function TerminalTab({ lines, onRunCommand, hiddenLineCount = 0, onClear }: TerminalTabProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  // Position while browsing history with the arrow keys; null = editing a new line.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const visibleLines = lines.slice(hiddenLineCount)

  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [lines, hiddenLineCount])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const command = input.trim()
    if (command === '') return
    if (onClear && command.toLowerCase() === 'cls') onClear()
    else onRunCommand(command)
    setHistory((current) => [...current, command])
    setHistoryIndex(null)
    setInput('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (history.length === 0) return
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(next)
      setInput(history[next] ?? '')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (historyIndex === null) return
      const next = historyIndex + 1
      if (next >= history.length) {
        setHistoryIndex(null)
        setInput('')
      } else {
        setHistoryIndex(next)
        setInput(history[next] ?? '')
      }
    }
  }

  // Click anywhere in the window to type, unless the player is selecting output text.
  function focusInput() {
    if (window.getSelection()?.toString()) return
    inputRef.current?.focus()
  }

  return (
    <div className="flex h-80 flex-col overflow-hidden rounded-lg border border-slate-400 bg-black shadow-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-600 md:h-[28rem]">
      <div className="flex items-center gap-2 bg-slate-100 px-2 py-1 text-xs text-slate-700">
        <SquareTerminal className="h-4 w-4 text-slate-600" aria-hidden="true" />
        <span className="flex-1 truncate">Komut İstemi</span>
        {onClear && (
          <button
            type="button"
            onClick={() => {
              onClear()
              inputRef.current?.focus()
            }}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-200 ${focusRing}`}
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
            Temizle
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        onClick={focusInput}
        className="flex-1 cursor-text overflow-y-auto px-3 py-2 font-console text-[13px] leading-snug"
      >
        <div role="log" aria-live="polite" aria-label="Komut çıktısı">
          {visibleLines.length === 0 && (
            <p className="whitespace-pre-wrap text-[#8a8a8a]">
              {'Komut yazıp Enter’a basın.\nKomut listesi: help · Ekranı temizlemek: cls\n\n'}
            </p>
          )}
          {visibleLines.map((line, offset) => (
            // Lines are append-only, so the absolute index is a stable key.
            <pre key={hiddenLineCount + offset} className={`whitespace-pre-wrap break-words font-console ${lineColors[line.kind]}`}>
              {line.kind === 'input' ? `${prompt}${line.text}` : line.text}
            </pre>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex items-center text-[#f2f2f2]">
          <label htmlFor={inputId} className="shrink-0 whitespace-pre">
            {prompt}
            <span className="sr-only"> Komut</span>
          </label>
          <input
            ref={inputRef}
            id={inputId}
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setHistoryIndex(null)
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            className="min-w-0 flex-1 bg-transparent p-0 font-console text-base md:text-[13px] text-[#f2f2f2] caret-[#f2f2f2] outline-none"
          />
        </form>
      </div>
    </div>
  )
}

export default TerminalTab
