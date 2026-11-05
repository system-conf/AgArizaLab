import type { PacketTrace } from '../../domain/EngineContract'
import type { MapPosition } from '../../domain/NetworkTypes'

export type PacketFrame =
  | { kind: 'packet'; position: MapPosition; returning: boolean }
  | { kind: 'failed'; position: MapPosition }

export const hopMilliseconds = 350
export const failureMilliseconds = 1500

function lerp(from: MapPosition, to: MapPosition, fraction: number): MapPosition {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }
}

/**
 * Timeline of one ping on the map: the packet walks `trace.path` hop by hop; on success it walks
 * back (the reply), on failure a red mark stays at the last device for a moment.
 */
export class PacketAnimationPlan {
  private readonly path: readonly string[]
  private readonly ok: boolean
  private readonly outMilliseconds: number

  constructor(trace: PacketTrace) {
    this.path = trace.path
    this.ok = trace.ok
    this.outMilliseconds = Math.max(0, trace.path.length - 1) * hopMilliseconds
  }

  /** Total length in milliseconds; 0 means nothing to show. */
  get duration(): number {
    if (this.path.length === 0) return 0
    return this.ok ? this.outMilliseconds * 2 : this.outMilliseconds + failureMilliseconds
  }

  /** What to draw `elapsed` ms after the start; null when the animation is over. */
  frameAt(elapsed: number, positionOf: (deviceId: string) => MapPosition): PacketFrame | null {
    if (elapsed < 0 || elapsed >= this.duration) return null
    if (elapsed < this.outMilliseconds) {
      return { kind: 'packet', position: this.walk(this.path, elapsed, positionOf), returning: false }
    }
    if (this.ok) {
      const back = [...this.path].reverse()
      return { kind: 'packet', position: this.walk(back, elapsed - this.outMilliseconds, positionOf), returning: true }
    }
    const last = this.path[this.path.length - 1]
    if (last === undefined) return null
    return { kind: 'failed', position: positionOf(last) }
  }

  private walk(path: readonly string[], elapsed: number, positionOf: (deviceId: string) => MapPosition): MapPosition {
    const hop = Math.min(Math.floor(elapsed / hopMilliseconds), path.length - 2)
    const from = path[hop]
    const to = path[hop + 1]
    if (from === undefined || to === undefined) throw new Error('Packet walk outside the trace path')
    return lerp(positionOf(from), positionOf(to), (elapsed - hop * hopMilliseconds) / hopMilliseconds)
  }
}
