import { useEffect, useRef, useState } from 'react'
import type { PacketTrace } from '../../domain/EngineContract'
import type { MapPosition } from '../../domain/NetworkTypes'
import { PacketAnimationPlan, type PacketFrame } from './PacketAnimationPlan'

/**
 * Plays a ping trace once each time a new trace object arrives. Device positions are read live,
 * so dragging during the animation keeps the packet on the line. Skipped when `disabled`.
 */
export function usePacketAnimation(
  trace: PacketTrace | null,
  positionOf: (deviceId: string) => MapPosition,
  disabled: boolean,
): PacketFrame | null {
  const [frame, setFrame] = useState<PacketFrame | null>(null)
  const positionRef = useRef(positionOf)

  useEffect(() => {
    positionRef.current = positionOf
  })

  useEffect(() => {
    if (!trace || disabled) return undefined
    const plan = new PacketAnimationPlan(trace)
    let startedAt: number | null = null
    let handle = window.requestAnimationFrame(tick)

    function tick(now: number) {
      startedAt ??= now
      const next = plan.frameAt(now - startedAt, positionRef.current)
      setFrame(next)
      if (next) handle = window.requestAnimationFrame(tick)
    }

    return () => window.cancelAnimationFrame(handle)
  }, [trace, disabled])

  return trace && !disabled ? frame : null
}
