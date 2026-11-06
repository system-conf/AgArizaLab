import { useCallback, useEffect, useState } from 'react'
import type { TerminalLine } from '../../../domain'
import { localizedMessage } from '../../../i18n/messageKeys'
import type { CommandResult, WorkspaceTerminal } from '../../simulation'
import type { LabDocumentState } from '../labServices'
import { TerminalLogs } from './TerminalLogs'

export interface DeviceTerminals {
  linesOf: (deviceId: string) => readonly TerminalLine[]
  hiddenCountOf: (deviceId: string) => number
  /** Runs one line on the device; network changes (`ipconfig /renew`) become one undo step. */
  run: (deviceId: string, commandLine: string) => void
  clear: (deviceId: string) => void
}

interface TerminalState {
  /** The lab the logs belong to; opening another lab starts with empty terminals. */
  labId: string
  logs: TerminalLogs
}

const STEPPING_LINE: TerminalLine = { kind: 'info', message: localizedMessage('simulation:ui.terminal.stepToAnswer') }
const WORKING_LINE: TerminalLine = { kind: 'info', message: localizedMessage('simulation:ui.terminal.running') }
const CANCELLED_LINE: TerminalLine = { kind: 'info', message: localizedMessage('simulation:ui.terminal.cancelled') }
const PREPARING_LINE: TerminalLine = { kind: 'info', message: localizedMessage('simulation:ui.terminal.preparing') }
const REVERTED_LINE: TerminalLine = { kind: 'info', message: localizedMessage('simulation:ui.terminal.reverted') }

const WAITING_LINES = { steps: STEPPING_LINE, worker: WORKING_LINE, preparing: PREPARING_LINE } as const

/**
 * Per-device command prompts of the open lab on the simulator (history lives in the screen, not in the
 * document). Realtime commands answer at once (large labs: when the Web Worker is done); in Simulation
 * mode a "waiting" line shows until the learner steps the request to its end, and a step back before the
 * end of a command that changed the lab (a DHCP lease) takes the change back. Commands typed while the
 * simulation is still being prepared wait for it.
 */
export function useDeviceTerminals(lab: LabDocumentState, terminal: WorkspaceTerminal): DeviceTerminals {
  const { labId, apply } = lab
  const [state, setState] = useState<TerminalState>(() => ({ labId, logs: TerminalLogs.empty() }))
  const current = state.labId === labId ? state : { labId, logs: TerminalLogs.empty() }

  const append = useCallback(
    (deviceId: string, lines: readonly TerminalLine[]) =>
      setState((previous) => ({ labId, logs: (previous.labId === labId ? previous.logs : TerminalLogs.empty()).append(deviceId, lines) })),
    [labId],
  )

  const finish = useCallback(
    (deviceId: string, result: CommandResult) => {
      append(deviceId, result.outcome.lines)
      if (result.outcome.nextState) apply((latest) => ({ ...latest, state: result.stateAfter(latest.state) }))
    },
    [append, apply],
  )

  useEffect(
    () =>
      terminal.subscribe(({ deviceId, result }) => {
        if (result.kind === 'done') return finish(deviceId, result)
        if (result.kind === 'cancelled') return append(deviceId, [CANCELLED_LINE])
        // A step back undid the command's change (a DHCP lease): the document follows the engine back,
        // as one undo step; a command still queued answers again when the learner steps to its end.
        const { restoredState } = result
        apply((latest) => (latest.state === restoredState ? latest : { ...latest, state: restoredState }))
        append(deviceId, result.waitsAgain ? [REVERTED_LINE, STEPPING_LINE] : [REVERTED_LINE])
      }),
    [append, apply, finish, terminal],
  )

  const run = useCallback(
    (deviceId: string, commandLine: string) => {
      append(deviceId, [{ kind: 'input', text: commandLine }])
      const progress = terminal.start(deviceId, commandLine)
      if (progress.kind === 'done') finish(deviceId, progress)
      else append(deviceId, [WAITING_LINES[progress.waitsFor]])
    },
    [append, finish, terminal],
  )

  const clear = useCallback(
    (deviceId: string) =>
      setState((previous) => ({ labId, logs: (previous.labId === labId ? previous.logs : TerminalLogs.empty()).clear(deviceId) })),
    [labId],
  )

  return {
    linesOf: (deviceId) => current.logs.linesOf(deviceId),
    hiddenCountOf: (deviceId) => current.logs.hiddenCountOf(deviceId),
    run,
    clear,
  }
}
