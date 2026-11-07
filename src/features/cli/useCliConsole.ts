import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Device, NetworkState, TerminalLine } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import { usePreference } from '../../preferences'
import { recentHistory } from '../preferences/model/preferenceWiring'
import {
  appCliShell,
  CliPrompt,
  type CliControlKey,
  type CliEnvironment,
  type CliStep,
  type ExerciseLockPolicy,
  type PagerKey,
  type SimRequest,
} from './cliServices'
import { cliSessions, cliSimulation } from './cliRuntime'
import { CliAccess } from './model/CliAccess'
import { CliConsole } from './model/CliConsole'

const LOCKED_LINE: TerminalLine = { kind: 'error', message: localizedMessage('cli:ui.locked') }

export interface CliConsoleOptions {
  labId: string
  device: Device
  network: NetworkState
  policy: ExerciseLockPolicy
  /** Applies a configuration change to the lab (the workspace's device editing: locks, undo). */
  onUpdate: (next: Device) => void
}

export interface CliConsoleControls {
  readonly console: CliConsole
  /** Enter: a command, an answer, a password or "press RETURN". */
  submit: (text: string) => void
  /** `?` after `text`; returns the text to keep in the input field. */
  help: (text: string) => string
  /** Tab: `text` with its last word completed. */
  complete: (text: string) => string
  pagerKey: (key: PagerKey) => void
  control: (key: CliControlKey, text: string) => void
  /** Commands of the current mode group, oldest first (Up / Down). */
  history: () => readonly string[]
  clear: () => void
}

/**
 * One device console on the app's shell (docs/CLI.md §4). The session lives in `cliSessions`, so it
 * survives tab and selection changes. Every configuration change goes to the lab through `onUpdate`
 * (GUI and CLI share the device, so Settings edits show in `show running-config` at once), unless the
 * exercise locks it; jobs (`ping`, `traceroute`) run on `cliSimulation`.
 */
export function useCliConsole({ labId, device, network, policy, onUpdate }: CliConsoleOptions): CliConsoleControls {
  const screen = useSyncExternalStore(cliSessions.subscribe, () => cliSessions.consoleOf(labId, device))
  // PU (Preferences → Terminal / CLI): Up / Down walk at most this many (the shell keeps 10 per mode, IOS default).
  const [historyLength] = usePreference('terminal.historyLength')
  // A job resumes after the lab may have changed: it reads the latest lab copies.
  const latest = useRef({ device, network, policy, onUpdate })
  useEffect(() => {
    latest.current = { device, network, policy, onUpdate }
  }, [device, network, policy, onUpdate])

  useEffect(() => cliSimulation.prepare(labId, network), [labId, network])

  // Powered on or off in the workspace: the console starts again (docs/CLI.md §4).
  useEffect(() => {
    const current = cliSessions.consoleOf(labId, device)
    if (current.powered !== device.powered) cliSessions.set(labId, device.id, CliConsole.open(appCliShell, device, current))
  }, [device, labId])

  function envOf(target: Device): CliEnvironment {
    const { network: lab } = latest.current
    return { network: lab, ...cliSimulation.view(labId, lab, target.id) }
  }

  function apply(from: CliConsole, step: CliStep, echo: readonly TerminalLine[]) {
    const { device: before, policy: locks, onUpdate: update } = latest.current
    let next = from.after(step, echo)
    if (step.device !== undefined) {
      if (CliAccess.allowsChange(locks, before, step.device)) update(step.device)
      // Refused: the lab keeps the device, so the prompt shows its unchanged hostname.
      else next = from.after(step, echo, [LOCKED_LINE], step.input === 'command' ? CliPrompt.render(before, step.state.mode) : step.prompt)
    }
    if (step.reloaded) cliSimulation.restart(labId)
    cliSessions.set(labId, before.id, next)
    if (step.job !== undefined) runJob(next, step.job)
  }

  function runJob(waiting: CliConsole, job: SimRequest) {
    const deviceId = latest.current.device.id
    void cliSimulation.run(labId, latest.current.network, job).then((record) => {
      // Ignored when the job was cancelled (Ctrl+C) or another lab was opened meanwhile.
      if (cliSessions.find(labId, deviceId) !== waiting) return
      const target = latest.current.device
      const step =
        record === null ? appCliShell.control(waiting.session, target, 'ctrlC') : appCliShell.resume(waiting.session, target, envOf(target), record)
      apply(waiting, step, [])
    })
  }

  const current = () => cliSessions.consoleOf(labId, latest.current.device)

  return {
    console: screen,
    submit: (text) => {
      const from = current()
      if (from.input === 'busy') return
      const target = latest.current.device
      apply(from, appCliShell.submit(from.session, target, envOf(target), text), from.submitEcho(text))
    },
    help: (text) => {
      const from = current()
      const step = appCliShell.help(from.session, latest.current.device, text)
      apply(from, step, from.helpEcho(text))
      return step.keepInput ?? text
    },
    complete: (text) => appCliShell.complete(current().session, latest.current.device, text),
    pagerKey: (key) => {
      const from = current()
      apply(from, appCliShell.pagerKey(from.session, latest.current.device, key), [])
    },
    control: (key, text) => {
      const from = current()
      apply(from, appCliShell.control(from.session, latest.current.device, key), from.controlEcho(text, key))
    },
    history: () => recentHistory(appCliShell.history(current().session), historyLength),
    clear: () => cliSessions.set(labId, latest.current.device.id, current().cleared()),
  }
}
