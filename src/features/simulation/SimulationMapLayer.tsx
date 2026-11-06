import { ViewportPortal } from '@xyflow/react'
import { Mail, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CanvasPoint, LabLayout, Link } from '../../domain'
import { useMessageTranslator } from '../../i18n'
import { usePrefersReducedMotion } from '../shared/usePrefersReducedMotion'
import { DEVICE_NODE_SIZE } from '../workspace/workspaceConstants'
import { EventHighlights } from './model/EventHighlights'
import { PacketMarkers, type MapPacket } from './model/PacketMarkers'
import { PROTOCOL_STYLES } from './protocolStyles'
import { SimMessages } from './simulationServices'
import type { WorkspaceSimulation } from './useSimulation'
import { useStepProgress } from './useStepProgress'

interface SimulationMapLayerProps {
  simulation: WorkspaceSimulation
  layout: LabLayout
  links: readonly Link[]
  nameOf: (deviceId: string) => string
}

/** Packets keep this far from device centres so the device icons stay visible. */
const ICON_CLEARANCE = 30
const HIGHLIGHT_COLOUR = '#f59e0b'

function centreOf(layout: LabLayout, deviceId: string): CanvasPoint {
  const topLeft = layout.devices[deviceId] ?? { x: 0, y: 0 }
  return { x: topLeft.x + DEVICE_NODE_SIZE / 2, y: topLeft.y + DEVICE_NODE_SIZE / 2 }
}

/** Point `fraction` of the way along the visible part of the cable (outside both icons). */
function along(from: CanvasPoint, to: CanvasPoint, fraction: number): CanvasPoint {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length <= ICON_CLEARANCE * 2) return { x: from.x + dx * fraction, y: from.y + dy * fraction }
  const distance = ICON_CLEARANCE + (length - ICON_CLEARANCE * 2) * fraction
  return { x: from.x + (dx / length) * distance, y: from.y + (dy / length) * distance }
}

/**
 * Simulation overlay inside the canvas viewport: the selected event's device and links in amber, and
 * every packet of the current step as an envelope in its protocol's colour (red ✕ where it was
 * dropped). Packets are buttons: a click opens the inspector. No movement with reduced motion.
 */
function SimulationMapLayer({ simulation, layout, links, nameOf }: SimulationMapLayerProps) {
  const { t } = useTranslation('simulation')
  const translate = useMessageTranslator()
  const reducedMotion = usePrefersReducedMotion()
  const { view, selectedEvent, playback } = simulation
  const stepWindow = view?.window ?? null
  const progress = useStepProgress(stepWindow, playback.stepMs, reducedMotion)
  const markers = useMemo(() => new PacketMarkers(view?.transmissions ?? [], view?.events ?? [], stepWindow), [view, stepWindow])
  const highlight = useMemo(
    () => (selectedEvent ? EventHighlights.of(selectedEvent, view?.transmissions ?? [], links) : null),
    [links, selectedEvent, view],
  )
  if (simulation.mode !== 'simulation') return null
  const packets = markers.at(progress)

  function linkLine(linkId: string) {
    const link = links.find((candidate) => candidate.id === linkId)
    if (!link) return null
    const a = centreOf(layout, link.a.deviceId)
    const b = centreOf(layout, link.b.deviceId)
    return <line key={linkId} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={HIGHLIGHT_COLOUR} strokeWidth={12} strokeLinecap="round" opacity={0.4} />
  }

  function packetButton(packet: MapPacket) {
    const position = along(centreOf(layout, packet.fromDeviceId), centreOf(layout, packet.toDeviceId), packet.fraction)
    const droppedHere = packet.dropped && packet.fraction >= 1
    const params = { protocol: translate(SimMessages.protocol(packet.protocol)), from: nameOf(packet.fromDeviceId), to: nameOf(packet.toDeviceId) }
    const label = droppedHere ? t('ui.inspector.packetDropped', params) : t('ui.inspector.packet', params)
    const selected = selectedEvent !== null && (selectedEvent.id === packet.arrivalEventId || selectedEvent.id === packet.sentByEventId)
    return (
      <button
        key={packet.transmissionId}
        type="button"
        aria-label={label}
        title={label}
        onClick={() => simulation.selectEvent(packet.arrivalEventId ?? packet.sentByEventId)}
        className={`nodrag nopan pointer-events-auto absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-white shadow-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
          selected ? 'ring-4 ring-amber-300' : ''
        }`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -50%)`,
          backgroundColor: droppedHere ? '#dc2626' : PROTOCOL_STYLES[packet.protocol].fill,
        }}
      >
        {droppedHere ? <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
      </button>
    )
  }

  const device = highlight ? centreOf(layout, highlight.deviceId) : null
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
