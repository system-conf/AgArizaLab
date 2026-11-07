/**
 * State of a touch long-press on one element: started by a touch pointer, cancelled when the
 * finger moves (scroll / drag) or lifts early, fired after the delay. After it fired, the click
 * the browser sends on release is swallowed (a long-press shows details, it does not add).
 */
export class LongPressGesture {
  static readonly DELAY_MS = 500
  /** Finger travel (CSS px) that turns the press into a scroll or a drag. */
  static readonly MOVE_TOLERANCE = 10

  private origin: { pointerId: number; x: number; y: number } | null = null
  private fired = false

  /** A touch went down: the press is pending until `fire()` or a cancel. */
  begin(pointerId: number, x: number, y: number): void {
    this.origin = { pointerId, x, y }
    this.fired = false
  }

  /** The pointer moved; returns true when this cancelled the pending press. */
  move(pointerId: number, x: number, y: number): boolean {
    if (this.origin === null || this.origin.pointerId !== pointerId) return false
    if (Math.hypot(x - this.origin.x, y - this.origin.y) <= LongPressGesture.MOVE_TOLERANCE) return false
    this.origin = null
    return true
  }

  /** The pointer lifted or was cancelled before the delay ran out. */
  cancel(): void {
    this.origin = null
  }

  get pending(): boolean {
    return this.origin !== null
  }

  /** The delay ran out: returns true when the press was still pending (the long-press happens). */
  fire(): boolean {
    if (this.origin === null) return false
    this.origin = null
    this.fired = true
    return true
  }

  /** True once after a fired long-press: the click that follows must be ignored. */
  consumeClick(): boolean {
    if (!this.fired) return false
    this.fired = false
    return true
  }

  /** The press is pending or has just fired (the touch context menu would get in the way). */
  get active(): boolean {
    return this.origin !== null || this.fired
  }
}
