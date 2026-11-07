import { ViewportPortal } from '@xyflow/react'
import { Mail, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabLayout, Link } from '../../domain'
import { useMessageTranslator } from '../../i18n'
import { usePreference } from '../../preferences'
import { usePrefersReducedMotion } from '../shared/usePrefersReducedMotion'
import { DEVICE_NODE_SIZE } from '../workspace/workspaceConstants'
import { EventHighlights } from './model/EventHighlights'
import { PacketMarkers, type MapPacket } from './model/PacketMarkers'
import { PacketPlacement } from './model/PacketPlacement'
import { REPLAY_HOP_MS } from './model/RealtimeReplay'
import { PROTOCOL_STYLES } from './protocolStyles'
import { SimMessages } from './simulationServices'
import { DROPPED_FILL, usePacketAnimation, usePacketElements, type PacketElement } from './usePacketAnimation'
import type { WorkspaceSimulation } from './useSimulation'
import { useRealtimeReplay } from './useRealtimeReplay'

interface SimulationMapLayerProps {
  simulation: WorkspaceSimulation
  layout: LabLayout
  links: readonly Link[]
  nameOf: (deviceId: string) => string
}

const HIGHLIGHT_COLOUR = 'var(--color-packet-highlight)'
/** The envelope shows while the packet moves, the ✕ once it arrived dropped (`data-dropped`, set by the animation). */
const MOVING_ICON = 'group-data-[dropped]/packet:hidden'
const DROPPED_ICON = 'hidden group-data-[dropped]/packet:block'

/**
 * Simulation overlay inside the canvas viewport: the selected event's device and links in amber, and
 * every packet of the current step as an envelope in its protocol's colour (red ✕ where it was
 * dropped). Packets are buttons: a click opens the inspector. No movement with reduced motion.
 * Realtime mode replays the latest terminal command's frames hop by hop (decorative, not buttons);
 * with reduced motion the replay is skipped. The layer renders once per step; the packets move by
 * usePacketAnimation (requestAnimationFrame, straight into the elements).
 */
function SimulationMapLayer({ simulation, layout, links, nameOf }: SimulationMapLayerProps) {
  const { t } = useTranslation('simulation')
  const translate = useMessageTranslator()
  // PU (Preferences → Animation & simulation): animation off works like reduced motion (no movement, no replay).
  const [animationOn] = usePreference('simulation.animation')
  const reducedMotion = usePrefersReducedMotion() || !animationOn
  const { view, selectedEvent, playback } = simulation
  const stepping = simulation.mode === 'simulation'
  const replayFrame = useRealtimeReplay(stepping ? null : simulation.replay, reducedMotion)
  const stepWindow = stepping ? view.window : (replayFrame?.window ?? null)
  const durationMs = stepping ? playback.stepMs : REPLAY_HOP_MS
  const animate = stepWindow !== null && stepWindow.animate && !reducedMotion && durationMs > 0
  const markers = useMemo(
    () =>
      stepping
        ? new PacketMarkers(view.transmissions, view.events, stepWindow)
        : new PacketMarkers(replayFrame?.replay.transmissions ?? [], replayFrame?.replay.events ?? [], stepWindow),
    [replayFrame, stepWindow, stepping, view],
  )
  const placement = useMemo(() => new PacketPlacement(layout, DEVICE_NODE_SIZE), [layout])
  const elements = usePacketElements()
  usePacketAnimation({ markers, placement, elements, serial: stepWindow?.serial ?? -1, animate, durationMs })
  const highlight = useMemo(
    () => (stepping && selectedEvent ? EventHighlights.of(selectedEvent, view.transmissions, links) : null),
    [links, selectedEvent, stepping, view],
  )
  // Where the packets start; the animation moves them from here.
  const packets = useMemo(() => markers.at(animate ? 0 : 1), [animate, markers])
  if (packets.length === 0 && !highlight) return null

  /** Ref callback: the animation finds the element by its transmission id. */
  function register(transmissionId: number, entry: Omit<PacketElement, 'element'>) {
    return (element: HTMLElement | null) => {
      if (!element) return undefined
      elements.set(transmissionId, { element, ...entry })
      return () => {
        if (elements.get(transmissionId)?.element === element) elements.delete(transmissionId)
      }
    }
  }

  function linkLine(linkId: string) {
    const link = links.find((candidate) => candidate.id === linkId)
    if (!link) return null
    const a = placement.centreOf(link.a.deviceId)
    const b = placement.centreOf(link.b.deviceId)
    return <line key={linkId} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={HIGHLIGHT_COLOUR} strokeWidth={12} strokeLinecap="round" opacity={0.4} />
  }

  function packetButton(packet: MapPacket) {
    const place = placement.place(packet)
    const fill = PROTOCOL_STYLES[packet.protocol].fill
    const style = { transform: PacketPlacement.transform(place), backgroundColor: place.droppedHere ? DROPPED_FILL : fill }
    const dropped = place.droppedHere ? '' : undefined
    if (!stepping) {
      // Realtime replay: the same envelope, without a button (there is no inspector in realtime).
      return (
        <span
          key={packet.transmissionId}
          ref={register(packet.transmissionId, { fill, labels: null })}
          aria-hidden="true"
          data-dropped={dropped}
          className="group/packet absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-canvas text-white shadow-md dark:text-slate-950"
          style={style}
        >
          <Mail className={`h-3.5 w-3.5 ${MOVING_ICON}`} />
          <X className={`h-4 w-4 ${DROPPED_ICON}`} strokeWidth={3} />
        </span>
      )
    }
    const params = { protocol: translate(SimMessages.protocol(packet.protocol)), from: nameOf(packet.fromDeviceId), to: nameOf(packet.toDeviceId) }
    const labels = { moving: t('ui.inspector.packet', params), dropped: t('ui.inspector.packetDropped', params) }
    const label = place.droppedHere ? labels.dropped : labels.moving
    const selected = selectedEvent !== null && (selectedEvent.id === packet.arrivalEventId || selectedEvent.id === packet.sentByEventId)
    return (
      <button
        key={packet.transmissionId}
        ref={register(packet.transmissionId, { fill, labels })}
        type="button"
        aria-label={label}
        title={label}
        data-dropped={dropped}
        onClick={() => simulation.selectEvent(packet.arrivalEventId ?? packet.sentByEventId)}
        className={`group/packet nodrag nopan pointer-events-auto absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-canvas text-white shadow-md dark:text-slate-950 transition-[scale] hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
          selected ? 'ring-4 ring-amber-300 dark:ring-amber-700' : ''
        }`}
        style={style}
      >
        <Mail className={`h-4 w-4 ${MOVING_ICON}`} aria-hidden="true" />
        <X className={`h-4 w-4 ${DROPPED_ICON}`} strokeWidth={3} aria-hidden="true" />
      </button>
    )
  }

  const device = highlight ? placement.centreOf(highlight.deviceId) : null
  return (
    <ViewportPortal>
      {highlight && device && (
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} style={{ zIndex: 1000 }} aria-hidden="true">
          {highlight.linkIds.map(linkLine)}
          <circle cx={device.x} cy={device.y} r={DEVICE_NODE_SIZE / 2 + 10} fill="none" stroke={HIGHLIGHT_COLOUR} strokeWidth={4} />
        </svg>
      )}
      <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 2000 }}>
        {packets.map(packetButton)}
      </div>
    </ViewportPortal>
  )
}

export default SimulationMapLayer
