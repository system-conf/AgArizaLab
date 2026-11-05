import type { NetworkEngine, PacketTrace, TerminalLine } from '../domain/EngineContract'
import type { Device, Link, MapPosition, NetworkState } from '../domain/NetworkTypes'
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
  /** Set by the first successful check and never cleared. */
  solved: boolean
  notes: string
  lastCheck: readonly ConditionResult[] | null
  /** Map positions the learner dragged devices to; layout only, never read by the engine. */
  layout: Readonly<Record<string, MapPosition>>
  /** Route of the latest ping, for the map animation; null before the first ping. */
  lastTrace: PacketTrace | null
}

const noLines: readonly TerminalLine[] = []

function replaceById<T extends { id: string }>(items: T[], next: T, what: string): T[] {
  if (!items.some((item) => item.id === next.id)) throw new Error(`Unknown ${what} id: ${next.id}`)
  return items.map((item) => (item.id === next.id ? next : item))
}

/** Copies the display texts of `source` (device names, app link labels) onto `devices`, matched by id. */
function relabelDevices(devices: Device[], source: readonly Device[]): Device[] {
  const sourceById = new Map(source.map((device) => [device.id, device]))
  return devices.map((device) => {
    const localized = sourceById.get(device.id)
    if (!localized) return device
    const labels = new Map((localized.appLinks ?? []).map((appLink) => [appLink.id, appLink.label]))
    const appLinks = device.appLinks?.map((appLink) => ({ ...appLink, label: labels.get(appLink.id) ?? appLink.label }))
    return appLinks ? { ...device, name: localized.name, appLinks } : { ...device, name: localized.name }
  })
}

/**
 * One attempt at a scenario. Immutable: every change returns a new instance,
 * so React can compare sessions by reference.
 */
export class ScenarioSession {
  private readonly data: SessionData
  private readonly services: SessionServices

  private constructor(data: SessionData, services: SessionServices) {
    this.data = data
    this.services = services
  }

  static start(scenario: Scenario, services: SessionServices = defaultServices): ScenarioSession {
    return new ScenarioSession(
      {
        scenario,
        state: scenario.initialState,
        selectedDeviceId: null,
        terminal: {},
        hintsRevealed: 0,
        solved: false,
        notes: '',
        lastCheck: null,
        layout: {},
        lastTrace: null,
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

  get isSolved(): boolean {
    return this.data.solved
  }

  get notes(): string {
    return this.data.notes
  }

  /** Result of the latest verify; null before the first check. */
  get lastCheck(): readonly ConditionResult[] | null {
    return this.data.lastCheck
  }

  /** Route of the latest ping (kept until the next ping); null before the first one. */
  get lastTrace(): PacketTrace | null {
    return this.data.lastTrace
  }

  /** True when at least one device was dragged away from its scenario position. */
  get hasCustomLayout(): boolean {
    return Object.keys(this.data.layout).length > 0
  }

  /** Where the device is drawn: the dragged position if any, else the scenario position. */
  positionOf(deviceId: string): MapPosition {
    const moved = this.data.layout[deviceId]
    if (moved) return moved
    const device = this.data.state.devices.find((candidate) => candidate.id === deviceId)
    if (!device) throw new Error(`Unknown device id: ${deviceId}`)
    return device.position
  }

  terminalLines(deviceId: string): readonly TerminalLine[] {
    return this.data.terminal[deviceId] ?? noLines
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

  /** Moves a device on the map. Changes only the drawing, never the network state. */
  moveDevice(deviceId: string, position: MapPosition): ScenarioSession {
    if (!this.data.state.devices.some((device) => device.id === deviceId)) {
      throw new Error(`Unknown device id: ${deviceId}`)
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error(`Invalid map position for ${deviceId}`)
    }
    return this.with({ layout: { ...this.data.layout, [deviceId]: { x: position.x, y: position.y } } })
  }

  /** Puts every device back at its scenario position. */
  resetLayout(): ScenarioSession {
    return this.hasCustomLayout ? this.with({ layout: {} }) : this
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
      lastTrace: result.trace ?? this.data.lastTrace,
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

  /** Evaluates solvedWhen; a success marks the session solved (kept even if a later check fails). */
  checkSolved(): ScenarioSession {
    const results = this.services.checker.check(this.data.state, this.data.scenario.solvedWhen)
    const solved = this.data.solved || results.every((result) => result.ok)
    return this.with({ lastCheck: results, solved })
  }

  /**
   * Takes the display texts of the same scenario in another language: the scenario itself (title,
   * complaint, guide steps, explanation) plus device names and app link labels, matched by id.
   * Everything the learner did (network changes, layout, terminal, notes, guide steps, checks) stays.
   */
  relabel(scenario: Scenario): ScenarioSession {
    if (scenario.id !== this.data.scenario.id) {
      throw new Error(`Cannot relabel scenario ${this.data.scenario.id} with ${scenario.id}`)
    }
    const state = this.data.state
    return this.with({ scenario, state: { ...state, devices: relabelDevices(state.devices, scenario.initialState.devices) } })
  }

  private with(changes: Partial<SessionData>): ScenarioSession {
    return new ScenarioSession({ ...this.data, ...changes }, this.services)
  }
}
