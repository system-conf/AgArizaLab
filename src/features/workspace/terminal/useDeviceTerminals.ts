import { useCallback, useEffect, useState } from 'react'
import type { NetworkState, TerminalLine } from '../../../domain'
import { localizedMessage } from '../../../i18n/messageKeys'
import { applySimulationEffects, type CommandResult, type WorkspaceTerminal } from '../../simulation'
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

/** The document state after a command: the engine's state when nothing changed meanwhile, else the effects on the edit. */
function stateAfter(latest: NetworkState, result: CommandResult): NetworkState {
  const { nextState, effects } = result.outcome
  if (!nextState) return latest
  return latest === result.labBefore ? nextState : applySimulationEffects(latest, effects)
}

/**
 * Per-device command prompts of the open lab on the simulator (history lives in the screen, not in the
 * document). Realtime commands answer at once (large labs: when the Web Worker is done); in Simulation
 * mode a "waiting" line shows until the learner steps the request to its end.
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
      if (result.outcome.nextState) apply((latest) => ({ ...latest, state: stateAfter(latest.state, result) }))
    },
    [append, apply],
  )

  useEffect(
    () =>
      terminal.subscribe(({ deviceId, result }) => {
        if (result.kind === 'done') finish(deviceId, result)
        else append(deviceId, [CANCELLED_LINE])
      }),
    [append, finish, terminal],
  )

  const run = useCallback(
    (deviceId: string, commandLine: string) => {
      append(deviceId, [{ kind: 'input', text: commandLine }])
      const progress = terminal.start(deviceId, commandLine)
      if (progress.kind === 'done') finish(deviceId, progress)
      else append(deviceId, [progress.waitsFor === 'steps' ? STEPPING_LINE : WORKING_LINE])
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
