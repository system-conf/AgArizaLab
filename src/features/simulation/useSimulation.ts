import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { NetworkState } from '../../domain'
import { usePreferencesStore } from '../../preferences'
import { workspaceEngineBuild } from './model/engineBuild'
import type { RealtimeReplay } from './model/RealtimeReplay'
import { SimulationPlayer, type EngineBuild, type PlayerView } from './model/SimulationPlayer'
import { SimulationTerminal, type CommandProgress, type FinishedCommand } from './model/SimulationTerminal'
import { downloadPcap, pcapFileName } from './pcapDownload'
import {
  SIMULATION_ON_DEMAND_DEVICES,
  simWorkerClient,
  type EventFilter,
  type SimEvent,
  type SimMode,
  type SimPingRequest,
  type WorkerJobs,
} from './simulationServices'
import { usePlayback, type Playback } from './usePlayback'
import { useRealtimeClock } from './useRealtimeClock'
import type { NumberedReplay } from './useRealtimeReplay'
import { useSimplePdu, type SimplePduControls } from './useSimplePdu'

type Notify = (text: string, tone: 'info' | 'success' | 'error' | 'warning') => void

export interface SimulationOptions {
  network: NetworkState
  /** Storage id of the open lab: opening another lab starts a fresh simulation. */
  labId: string
  nameOf: (deviceId: string) => string
  notify: Notify
  /** Lab title: the .pcap file name. */
  title: string
  /** Default: the simulator, loaded on demand, large labs settled in the Web Worker. Read once. */
  build?: EngineBuild
  /** Default: the app's Web Worker client. Read once. */
  worker?: WorkerJobs
}

/** Terminal commands on the simulation, in the current mode. */
export interface WorkspaceTerminal {
  /** Realtime: the outcome (pending while the Web Worker runs it); Simulation: pending until stepped. */
  start(deviceId: string, line: string): CommandProgress
  /** Hears about commands that finished, were cancelled or were undone after `start` returned pending. */
  subscribe(listener: (command: FinishedCommand) => void): () => void
}

/** Everything the simulation toolbar, panel, map layer and terminals need; one instance per workspace. */
export interface WorkspaceSimulation {
  readonly mode: SimMode
  setMode(mode: SimMode): void
  readonly view: PlayerView
  /** Builds the engine now (a very large lab starts on demand). */
  prepare(): void
  readonly playback: Playback
  reset(): void
  readonly filter: EventFilter
  setFilter(filter: EventFilter): void
  readonly selectedEvent: SimEvent | null
  selectEvent(eventId: number | null): void
  readonly pduTool: SimplePduControls
  exportPcap(): void
  /** Realtime: the latest terminal command's frames to replay on the map; null before the first. */
  readonly replay: NumberedReplay | null
  readonly terminal: WorkspaceTerminal
}

/** Very large labs open without a simulation; it starts when the learner asks for it. */
function startsOnDemand(network: NetworkState): boolean {
  return network.devices.length > SIMULATION_ON_DEMAND_DEVICES
}

/**
 * The workspace's simulation (docs/SIMULATION.md §5.5, §8): one player per open lab, created with the
 * workspace (terminals and verification use it in both modes), Realtime / Simulation mode, playback,
 * the event filter and selection, the Simple PDU tool, the Wireshark export and the realtime replay of
 * terminal commands. The engine is built off the first paint (large labs in the Web Worker; very large
 * labs only on demand) while the lab stays editable; it follows the lab document, and edits drop the
 * step-back history.
 */
export function useSimulation(options: SimulationOptions): WorkspaceSimulation {
  const { network, labId, nameOf, notify, title } = options
  const { t } = useTranslation('simulation')
  // PU (Preferences → Animation & simulation): start mode and the event list's starting filter, read once.
  const preferences = usePreferencesStore()
  const [mode, setModeState] = useState<SimMode>(() => preferences.get('simulation.defaultMode'))
  const [replay, setReplay] = useState<NumberedReplay | null>(null)
  const [worker] = useState(() => options.worker ?? simWorkerClient)
  const [player] = useState(
    () => new SimulationPlayer(options.build ?? workspaceEngineBuild(worker), network, { startNow: !startsOnDemand(network) || mode === 'simulation' }),
  )
  const [runner] = useState(
    () =>
      new SimulationTerminal(player, worker, (next: RealtimeReplay | null) =>
        setReplay((current) => (next ? { replay: next, id: (current?.id ?? 0) + 1 } : null)),
      ),
  )
  const [filter, setFilter] = useState<EventFilter>(() => ({ protocols: preferences.get('simulation.defaultEventFilters') }))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const view = useSyncExternalStore(player.subscribe, player.getView)
  const playback = usePlayback(player, view.window?.serial ?? 0)
  const { pause } = playback
  const openedLab = useRef(labId)
  const announcedLab = useRef<string | null>(null)

  // Another lab was opened: a fresh simulation (before the reconfigure below sees the new network).
  useEffect(() => {
    if (openedLab.current === labId) return
    openedLab.current = labId
    pause()
    player.reset(network, !startsOnDemand(network))
  }, [labId, network, pause, player])

  // A very large lab: say once per lab that the simulation waits until it is needed.
  useEffect(() => {
    if (announcedLab.current === labId) return
    announcedLab.current = labId
    if (startsOnDemand(network)) notify(t('ui.prepare.onDemand', { count: network.devices.length }), 'warning')
  }, [labId, network, notify, t])

  useEffect(() => {
    if (view.settleTruncated) notify(t('ui.prepare.truncated'), 'info')
  }, [notify, t, view.settleTruncated])

  useEffect(() => {
    player.reconfigure(network)
  }, [network, player])

  useRealtimeClock(mode === 'realtime' ? player : null)

  const inject = useCallback((request: SimPingRequest) => void player.inject(request), [player])
  const pduTool = useSimplePdu({ network, nameOf, notify, inject })
  const cancelTool = pduTool.cancel

  const prepare = useCallback(() => void player.prepare(), [player])

  const setMode = useCallback(
    (next: SimMode) => {
      setModeState(next)
      if (next === 'simulation') return void player.prepare()
      pause()
      cancelTool()
      player.runToIdle()
    },
    [cancelTool, pause, player],
  )

  const reset = useCallback(() => {
    pause()
    setSelectedId(null)
    player.reset(network)
  }, [network, pause, player])

  const exportPcap = useCallback(() => {
    const result = player.exportPcap(Date.now() - player.time)
    if (!result || result.packets === 0) {
      notify(t('ui.controls.exportEmpty'), 'info')
      return
    }
    const file = pcapFileName(title, t('ui.title'))
    downloadPcap(result.bytes, file)
    notify(t('ui.controls.exported', { count: result.packets, file }), 'success')
    if (result.skippedSerial > 0) notify(t('ui.controls.skippedSerial', { count: result.skippedSerial }), 'info')
  }, [notify, player, t, title])

  const terminal = useMemo<WorkspaceTerminal>(
    () => ({ start: (deviceId, line) => runner.start(deviceId, line, mode), subscribe: runner.subscribe }),
    [mode, runner],
  )

  const selectedEvent = useMemo(
    () => (selectedId === null ? null : (view.events.find((event) => event.id === selectedId) ?? null)),
    [selectedId, view],
  )

  return {
    mode,
    setMode,
    view,
    prepare,
    playback,
    reset,
    filter,
    setFilter,
    selectedEvent,
    selectEvent: setSelectedId,
    pduTool,
    exportPcap,
    replay,
    terminal,
  }
}
