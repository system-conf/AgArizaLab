import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { NetworkState } from '../../domain'
import { EventFilters } from './model/EventFilters'
import { SimulationPlayer, type PlayerView } from './model/SimulationPlayer'
import { downloadPcap, pcapFileName } from './pcapDownload'
import {
  createSimulationEngine,
  type EngineFactory,
  type EventFilter,
  type SimEvent,
  type SimMode,
  type SimPingRequest,
} from './simulationServices'
import { usePlayback, type Playback } from './usePlayback'
import { useRealtimeClock } from './useRealtimeClock'
import { useSimplePdu, type SimplePduControls } from './useSimplePdu'

type Notify = (text: string, tone: 'info' | 'success' | 'error') => void

export interface SimulationOptions {
  network: NetworkState
  nameOf: (deviceId: string) => string
  notify: Notify
  /** Lab title: the .pcap file name. */
  title: string
  /** Default: `createSimulationEngine` (wave 3.2 wires the real layers there). */
  createEngine?: EngineFactory
}

/** Everything the simulation toolbar, panel and map layer need; one instance per workspace. */
export interface WorkspaceSimulation {
  readonly mode: SimMode
  setMode(mode: SimMode): void
  /** null until the learner opened simulation mode once. */
  readonly view: PlayerView | null
  readonly playback: Playback
  reset(): void
  readonly filter: EventFilter
  setFilter(filter: EventFilter): void
  readonly selectedEvent: SimEvent | null
  selectEvent(eventId: number | null): void
  readonly pduTool: SimplePduControls
  exportPcap(): void
}

const noSubscription = () => () => {}
const noView = () => null

/**
 * The workspace's simulation (docs/SIMULATION.md §5.5, §8): Realtime / Simulation mode, the player
 * with its step history, playback, the event filter and selection, the Simple PDU tool and the
 * Wireshark export. The engine follows the lab document; edits drop the step-back history.
 */
export function useSimulation({ network, nameOf, notify, title, createEngine = createSimulationEngine }: SimulationOptions): WorkspaceSimulation {
  const { t } = useTranslation('simulation')
  const [mode, setModeState] = useState<SimMode>('realtime')
  const [player, setPlayer] = useState<SimulationPlayer | null>(null)
  const [filter, setFilter] = useState<EventFilter>(EventFilters.all)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const view = useSyncExternalStore(player?.subscribe ?? noSubscription, player?.getView ?? noView)
  const playback = usePlayback(player, view?.window?.serial ?? 0)
  const { pause } = playback

  useEffect(() => {
    player?.reconfigure(network)
  }, [network, player])

  useRealtimeClock(mode === 'realtime' ? player : null)

  const inject = useCallback((request: SimPingRequest) => player?.inject(request), [player])
  const pduTool = useSimplePdu({ network, nameOf, notify, inject })
  const cancelTool = pduTool.cancel

  const setMode = useCallback(
    (next: SimMode) => {
      setModeState(next)
      if (next === 'simulation') {
        if (!player) setPlayer(new SimulationPlayer(createEngine, network))
        return
      }
      pause()
      cancelTool()
      player?.runToIdle()
    },
    [cancelTool, createEngine, network, pause, player],
  )

  const reset = useCallback(() => {
    pause()
    setSelectedId(null)
    player?.reset(network)
  }, [network, pause, player])

  const exportPcap = useCallback(() => {
    if (!player) return
    const result = player.exportPcap(Date.now() - player.time)
    if (result.packets === 0) {
      notify(t('ui.controls.exportEmpty'), 'info')
      return
    }
    const file = pcapFileName(title, t('ui.title'))
    downloadPcap(result.bytes, file)
    notify(t('ui.controls.exported', { count: result.packets, file }), 'success')
    if (result.skippedSerial > 0) notify(t('ui.controls.skippedSerial', { count: result.skippedSerial }), 'info')
  }, [notify, player, t, title])

  const selectedEvent = useMemo(
    () => (selectedId === null ? null : (view?.events.find((event) => event.id === selectedId) ?? null)),
    [selectedId, view],
  )

  return {
    mode,
    setMode,
    view,
    playback,
    reset,
    filter,
    setFilter,
    selectedEvent,
    selectEvent: setSelectedId,
    pduTool,
    exportPcap,
  }
}
