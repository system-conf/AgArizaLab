import { useCallback, useState } from 'react'
import type { PacketTrace, TerminalLine } from '../../../domain'
import { runDeviceCommand, type LabDocumentState } from '../labServices'
import { TerminalLogs } from './TerminalLogs'

export interface DeviceTerminals {
  linesOf: (deviceId: string) => readonly TerminalLine[]
  hiddenCountOf: (deviceId: string) => number
  /** Runs one line on the device; network changes (`ipconfig /renew`) become one undo step. */
  run: (deviceId: string, commandLine: string) => void
  clear: (deviceId: string) => void
  /** Route of the latest ping / tracert, for the canvas animation; null before the first one. */
  trace: PacketTrace | null
}

interface TerminalState {
  /** The lab the logs belong to; opening another lab starts with empty terminals. */
  labId: string
  logs: TerminalLogs
  trace: PacketTrace | null
}

/** Per-device command prompts of the open lab (history lives in the screen, not in the document). */
export function useDeviceTerminals(lab: LabDocumentState): DeviceTerminals {
  const { labId, doc, apply } = lab
  const [state, setState] = useState<TerminalState>(() => ({ labId, logs: TerminalLogs.empty(), trace: null }))
  const current = state.labId === labId ? state : { labId, logs: TerminalLogs.empty(), trace: null }

  const run = useCallback(
    (deviceId: string, commandLine: string) => {
      const before = doc.state
      const result = runDeviceCommand(before, deviceId, commandLine)
      setState((previous) => {
        const logs = previous.labId === labId ? previous.logs : TerminalLogs.empty()
        const trace = result.trace ?? (previous.labId === labId ? previous.trace : null)
        return { labId, logs: logs.append(deviceId, [{ kind: 'input', text: commandLine }, ...result.lines]), trace }
      })
      const next = result.nextState
      // Applied only to the state the command ran on, so a racing edit is never overwritten.
      if (next) apply((latest) => (latest.state === before ? { ...latest, state: next } : latest))
    },
    [apply, doc.state, labId],
  )

  const clear = useCallback(
    (deviceId: string) =>
      setState((previous) => ({
        labId,
        logs: (previous.labId === labId ? previous.logs : TerminalLogs.empty()).clear(deviceId),
        trace: previous.labId === labId ? previous.trace : null,
      })),
    [labId],
  )

  return {
    linesOf: (deviceId) => current.logs.linesOf(deviceId),
    hiddenCountOf: (deviceId) => current.logs.hiddenCountOf(deviceId),
    run,
    clear,
    trace: current.trace,
  }
}
