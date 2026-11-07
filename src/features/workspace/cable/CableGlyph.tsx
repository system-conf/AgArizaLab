import { Sparkles, Wifi } from 'lucide-react'
import type { CableTool } from '../../../domain'

/** Stroke colour and dash of each cable glyph (our own colour code, readable on white). */
const CABLE_STYLE: Readonly<Record<Exclude<CableTool, 'auto' | 'wireless'>, { tone: string; dash?: string }>> = {
  copperStraight: { tone: 'text-slate-700 dark:text-slate-300' },
  copperCross: { tone: 'text-slate-700 dark:text-slate-300', dash: '3 2' },
  fiber: { tone: 'text-orange-600 dark:text-orange-400' },
  serial: { tone: 'text-red-600 dark:text-red-400' },
  console: { tone: 'text-sky-600 dark:text-sky-400' },
  coaxial: { tone: 'text-blue-900 dark:text-blue-300' },
}

/** Small icon for a cable tool: a coloured cable, the Wi-Fi symbol or the "auto" sparkle. */
function CableGlyph({ tool, className = 'h-5 w-5' }: { tool: CableTool; className?: string }) {
  if (tool === 'auto') return <Sparkles className={className} aria-hidden="true" />
  if (tool === 'wireless') return <Wifi className={className} aria-hidden="true" />
  const { tone, dash } = CABLE_STYLE[tool]
  const path = tool === 'serial' ? 'M3 17 L9 7 L15 17 L21 7' : tool === 'console' ? 'M3 17 C 9 3, 15 21, 21 7' : 'M3 18 L21 6'
  return (
    <svg viewBox="0 0 24 24" className={`${tone} ${className}`} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={dash} />
      <circle cx={3} cy={tool === 'serial' || tool === 'console' ? 17 : 18} r={2} fill="currentColor" />
      <circle cx={21} cy={tool === 'serial' || tool === 'console' ? 7 : 6} r={2} fill="currentColor" />
    </svg>
  )
}

export default CableGlyph
