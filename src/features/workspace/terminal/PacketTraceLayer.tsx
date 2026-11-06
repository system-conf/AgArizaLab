import { useCallback } from 'react'
import type { PacketTrace } from '../../../domain/EngineContract'
import type { CanvasPoint, LabLayout } from '../../../domain/v2'
import PacketOverlay from '../../map/PacketOverlay'
import { usePacketAnimation } from '../../map/usePacketAnimation'
import { usePrefersReducedMotion } from '../../map/usePrefersReducedMotion'
import { DEVICE_NODE_SIZE } from '../workspaceConstants'

interface PacketTraceLayerProps {
  trace: PacketTrace | null
  layout: LabLayout
}

/**
 * The latest ping / tracert walking along the cables on the canvas (inside the React Flow
 * viewport). Skipped entirely when the system asks for reduced motion.
 */
function PacketTraceLayer({ trace, layout }: PacketTraceLayerProps) {
  const reducedMotion = usePrefersReducedMotion()
  const centreOf = useCallback(
    (deviceId: string): CanvasPoint => {
      const topLeft = layout.devices[deviceId] ?? { x: 0, y: 0 }
      return { x: topLeft.x + DEVICE_NODE_SIZE / 2, y: topLeft.y + DEVICE_NODE_SIZE / 2 }
    },
    [layout],
  )
  const frame = usePacketAnimation(trace, centreOf, reducedMotion)
  return <PacketOverlay frame={frame} />
}

export default PacketTraceLayer
