import { ViewportPortal } from '@xyflow/react'
import { X } from 'lucide-react'
import type { PacketFrame } from './PacketAnimationPlan'

interface PacketOverlayProps {
  frame: PacketFrame | null
}

/** The moving ping packet (blue out, green reply) or the red ✕ where it was dropped. */
function PacketOverlay({ frame }: PacketOverlayProps) {
  if (!frame) return null
  const style = {
    transform: `translate(${frame.position.x}px, ${frame.position.y}px) translate(-50%, -50%)`,
    zIndex: 2000,
  }

  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute left-0 top-0" style={style} aria-hidden="true">
        {frame.kind === 'failed' ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow">
            <X className="h-4 w-4" strokeWidth={3} />
          </span>
        ) : (
          <span
            className={`block h-3.5 w-3.5 rounded-full border-2 border-white shadow ${
              frame.returning ? 'bg-emerald-500' : 'bg-sky-500'
            }`}
          />
        )}
      </div>
    </ViewportPortal>
  )
}

export default PacketOverlay
