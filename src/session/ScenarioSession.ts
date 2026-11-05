import type { NetworkEngine, TerminalLine } from '../domain/EngineContract'
import type { Device, Link, NetworkState } from '../domain/NetworkTypes'
import type { Scenario } from '../domain/ScenarioTypes'
import { networkEngine, solveChecker, type ConditionResult, type SolveChecker } from '../engine'

/** Engine services a session needs; injectable for tests. */
export interface SessionServices {
  engine: NetworkEngine
  checker: SolveChecker
}

const defaultServices: SessionServices = { engine: networkEngine, checker: solveChecker }

/** The scenario contract fixes three hint levels. */
const MAX_HINTS = 3

interface SessionData {
  scenario: Scenario
  state: NetworkState
  selectedDeviceId: string | null
  terminal: Readonly<Record<string, readonly TerminalLine[]>>
  hintsRevealed: number
  /** Epoch milliseconds. */
  startedAt: number
  /** Epoch milliseconds; null while unsolved. */
  finishedAt: number | null
  notes: string
  lastCheck: readonly ConditionResult[] | null
}

const noLines: readonly TerminalLine[] = []

function replaceById<T extends { id: string }>(items: T[], next: T, what: string): T[] {
  if (!items.some((item) => item.id === next.id)) throw new Error(`Unknown ${what} id: ${next.id}`)
  return items.map((item) => (item.id === next.id ? next : item))
}

/**
 * One play-through of a scenario. Immutable: every change returns a new instance,
 * so React can compare sessions by reference.
 */
export class ScenarioSession {
  private readonly data: SessionData
  private readonly services: SessionServices

  private constructor(data: SessionData, services: SessionServices) {
    this.data = data
    this.services = services
  }

  static start(scenario: Scenario, startedAt: number, services: SessionServices = defaultServices): ScenarioSession {
    return new ScenarioSession(
      {
        scenario,
        state: scenario.initialState,
        selectedDeviceId: null,
        terminal: {},
        hintsRevealed: 0,
        startedAt,
        finishedAt: null,
        notes: '',
        lastCheck: null,
      },
      services,
    )
  }

  get scenario(): Scenario {
    return this.data.scenario
  }

  get state(): NetworkState {
    return this.data.state
  }

  get selectedDeviceId(): string | null {
    return this.data.selectedDeviceId
  }

  get selectedDevice(): Device | undefined {
    const id = this.data.selectedDeviceId
    return id === null ? undefined : this.data.state.devices.find((device) => device.id === id)
  }

  get hintsRevealed(): number {
    return this.data.hintsRevealed
  }

  get startedAt(): number {
    return this.data.startedAt
  }

  get finishedAt(): number | null {
    return this.data.finishedAt
  }

  get isSolved(): boolean {
    return this.data.finishedAt !== null
  }

  get notes(): string {
    return this.data.notes
  }

  /** Result of the latest "Çözdüm, kontrol et"; null before the first check. */
  get lastCheck(): readonly ConditionResult[] | null {
    return this.data.lastCheck
  }

  terminalLines(deviceId: string): readonly TerminalLine[] {
    return this.data.terminal[deviceId] ?? noLines
  }

  /** Whole seconds since start, frozen once the scenario is solved. */
  elapsedSeconds(now: number): number {
    const end = this.data.finishedAt ?? now
    return Math.max(0, Math.floor((end - this.data.startedAt) / 1000))
  }

  selectDevice(deviceId: string | null): ScenarioSession {
    if (deviceId !== null && !this.data.state.devices.some((device) => device.id === deviceId)) {
      throw new Error(`Unknown device id: ${deviceId}`)
    }
    return this.with({ selectedDeviceId: deviceId })
  }

  updateDevice(next: Device): ScenarioSession {
    const state = this.data.state
    return this.with({ state: { ...state, devices: replaceById(state.devices, next, 'device') } })
  }

  updateLink(next: Link): ScenarioSession {
    const state = this.data.state
    return this.with({ state: { ...state, links: replaceById(state.links, next, 'link') } })
  }

  /** Runs a terminal line on a host: echoes the input, then the engine output; applies network changes. */
  runCommand(deviceId: string, commandLine: string): ScenarioSession {
    const result = this.services.engine.runCommand(this.data.state, deviceId, commandLine)
    const lines: TerminalLine[] = [
      ...this.terminalLines(deviceId),
      { kind: 'input', text: commandLine },
      ...result.lines,
    ]
    return this.with({
      state: result.nextState ?? this.data.state,
      terminal: { ...this.data.terminal, [deviceId]: lines },
    })
  }

  revealHint(): ScenarioSession {
    const limit = Math.min(MAX_HINTS, this.data.scenario.hints.length)
    if (this.data.hintsRevealed >= limit) return this
    return this.with({ hintsRevealed: this.data.hintsRevealed + 1 })
  }

  setNotes(notes: string): ScenarioSession {
    return this.with({ notes })
  }

  /** Evaluates solvedWhen; on success records `now` as the finish time (kept if already solved). */
  checkSolved(now: number): ScenarioSession {
    const results = this.services.checker.check(this.data.state, this.data.scenario.solvedWhen)
    const solved = results.every((result) => result.ok)
    const finishedAt = this.data.finishedAt ?? (solved ? now : null)
    return this.with({ lastCheck: results, finishedAt })
  }

  private with(changes: Partial<SessionData>): ScenarioSession {
    return new ScenarioSession({ ...this.data, ...changes }, this.services)
  }
}
