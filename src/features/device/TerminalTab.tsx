import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { TerminalLine } from '../../domain/EngineContract'

interface TerminalTabProps {
  lines: TerminalLine[]
  onRunCommand: (line: string) => void
}

const prompt = 'C:\\>'

const lineColors: Record<TerminalLine['kind'], string> = {
  input: 'text-slate-100',
  output: 'text-slate-300',
  error: 'text-rose-300',
  info: 'text-sky-300',
}

/**
 * "Terminal" tab: a Windows-like command prompt. The component does not echo commands
 * itself; the caller appends an 'input' line (raw command text) plus the output lines.
 */
function TerminalTab({ lines, onRunCommand }: TerminalTabProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  // Position while browsing history with the arrow keys; null = editing a new line.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputId = useId()

  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [lines])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const command = input.trim()
    if (command === '') return
    onRunCommand(command)
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

  return (
    <div className="flex h-80 flex-col overflow-hidden rounded-lg bg-slate-900 font-mono text-sm md:h-[28rem]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3" role="log" aria-live="polite" aria-label="Komut çıktısı">
        {lines.length === 0 && (
          <p className="text-slate-400">Komut yazıp Enter’a basın. Komut listesi için: help</p>
        )}
        {lines.map((line, index) => (
          // Lines are append-only, so the index is a stable key.
          <pre key={index} className={`whitespace-pre-wrap break-words ${lineColors[line.kind]}`}>
            {line.kind === 'input' ? `${prompt}${line.text}` : line.text}
          </pre>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-1 border-t border-slate-700 px-3 py-2">
        <label htmlFor={inputId} className="text-slate-400">
          {prompt}
          <span className="sr-only"> Komut</span>
        </label>
        <input
          id={inputId}
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setHistoryIndex(null)
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="flex-1 bg-transparent text-slate-100 caret-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
        />
      </form>
    </div>
  )
}

export default TerminalTab
