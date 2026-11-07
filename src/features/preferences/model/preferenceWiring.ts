// How the consumers apply the preferences (docs/PREFERENCES.md §1, "Wired"). Pure helpers, so the wiring
// is tested once here and the components stay one-liners.
import type { CSSProperties } from 'react'
import type { CableTool } from '../../../domain'
import type { Preferences } from '../../../preferences'
import { CABLE_TOOLS } from '../../workspace/cable/cableTools'

type DeviceLabelMode = Preferences['map']['deviceLabels']
type PortLabelMode = Preferences['map']['portLabels']

/** Text lines under a device on the map: name, model, both (name first) or none. */
export function deviceLabelLines(mode: DeviceLabelMode, name: string, modelName: string): string[] {
  switch (mode) {
    case 'name':
      return [name]
    case 'model':
      return [modelName]
    case 'both':
      return name === modelName ? [name] : [name, modelName]
    case 'none':
      return []
  }
}

// Underscores in an arbitrary variant mean spaces to Tailwind, so the class name's own `__` is escaped
// (`\_`); String.raw keeps the backslashes in the class name, where the generated selector expects them.
const HOVER_PORT_LABEL = String.raw`opacity-0 transition-opacity [.react-flow\_\_edge:hover_&]:opacity-100 [.react-flow\_\_edge.selected_&]:opacity-100 [.react-flow\_\_edge:focus-visible_&]:opacity-100`

/**
 * Classes of a port label on a cable, or null when it is not drawn. `hover`: hidden until the pointer is
 * over the cable or the cable is selected or focused (React Flow's edge wrapper `.react-flow__edge`).
 */
export function portLabelClassName(mode: PortLabelMode): string | null {
  switch (mode) {
    case 'always':
      return ''
    case 'never':
      return null
    case 'hover':
      return HOVER_PORT_LABEL
  }
}

/** Cable tools the toolbar and the palette offer: without the automatic one when it is turned off. */
export function offeredCableTools(autoCable: boolean): readonly CableTool[] {
  return autoCable ? CABLE_TOOLS : CABLE_TOOLS.filter((tool) => tool !== 'auto')
}

/** The device tab the properties panel opens on: CLI for network devices when preferred (others fall back to Info). */
export function defaultDeviceTab(cliForNetworkDevices: boolean): 'cli' | 'info' {
  return cliForNetworkDevices ? 'cli' : 'info'
}

/** The last `length` entries of a command history (Up / Down walk at most this many). */
export function recentHistory<Entry>(history: readonly Entry[], length: number): Entry[] {
  return length <= 0 ? [] : history.slice(-length)
}

/** CSS variable with the terminal font size; classes use it as `text-(length:--terminal-font-size)`. */
export type TerminalFontStyle = CSSProperties & { '--terminal-font-size': string }

export function terminalFontStyle(sizePx: number): TerminalFontStyle {
  return { '--terminal-font-size': `${sizePx}px` }
}
