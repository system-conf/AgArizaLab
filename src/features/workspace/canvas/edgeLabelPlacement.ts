// Where a cable's link light and port label sit, so they never land on the device box or on the
// device's name under it (WorkspaceDeviceNode: 48 px box around the centre, name label below it).

export interface Point {
  x: number
  y: number
}

/** Half the device box (48 px) plus the box border. */
const BOX_HALF = 25
/** The name label under the box: starts at +28, up to two 15 px lines, about 80 px wide for most names. */
const NAME_TOP = 26
const NAME_BOTTOM = 58
const NAME_HALF_WIDTH = 42
/** Never further than half the cable, so both ends keep their own half. */
const MAX_FRACTION = 0.5

/**
 * Smallest distance from the device centre along the unit vector `u` at which an item with the
 * given half size is clear of the box and of the name label area below it.
 */
export function clearDistance(u: Point, halfWidth: number, halfHeight: number): number {
  const ax = Math.abs(u.x)
  const ay = Math.abs(u.y)
  const leave = (limitX: number, limitY: number) => Math.min(ax > 0 ? limitX / ax : Infinity, ay > 0 ? limitY / ay : Infinity)
  const box = leave(BOX_HALF + halfWidth, BOX_HALF + halfHeight)
  // Only cables leaving downwards cross the name label.
  const name = u.y > 0 ? leave(NAME_HALF_WIDTH + halfWidth, NAME_BOTTOM + halfHeight) : 0
  // A cable leaving sideways above the name (e.g. straight right) never meets it.
  const entersName = u.y > 0 && (ax === 0 || (NAME_TOP - halfHeight) / ay < (NAME_HALF_WIDTH + halfWidth) / ax)
  return Math.max(box, entersName ? name : 0)
}

/**
 * Point at least `distance` px from `from` towards `to`, pushed out of the device box and name
 * label, but kept in this end's half of the line: the item ends before the middle, so the labels of
 * the two ends of a short cable sit next to each other instead of on top of each other.
 */
export function placeAlong(from: Point, to: Point, distance: number, halfWidth: number, halfHeight: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length === 0) return from
  const u = { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
  const wanted = Math.max(distance, clearDistance(u, halfWidth, halfHeight))
  // Half the item's extent along the line, plus a 1 px gap.
  const extent = Math.abs(u.x) * halfWidth + Math.abs(u.y) * halfHeight + 1
  const along = Math.max(0, Math.min(wanted, length * MAX_FRACTION - extent))
  return { x: from.x + u.x * along, y: from.y + u.y * along }
}

/** Approximate half size of a 12 px port label such as "Gi0/0" or "Fa0/24". */
export function portLabelHalfSize(text: string): { halfWidth: number; halfHeight: number } {
  return { halfWidth: text.length * 3.6 + 4, halfHeight: 9 }
}

/** Link light radius plus its outline. */
const LED_HALF = 7
/** Gap between the link light and the port label along the cable. */
const LED_TO_LABEL = 24

/** Link light and port label of one cable end at `from` (the device centre), clear of the device. */
export function placeCableEnd(from: Point, to: Point, portId: string, ledDistance: number, labelDistance: number): { led: Point; label: Point } {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const led = placeAlong(from, to, ledDistance, LED_HALF, LED_HALF)
  const ledAt = Math.hypot(led.x - from.x, led.y - from.y)
  const { halfWidth, halfHeight } = portLabelHalfSize(portId)
  const label = placeAlong(from, to, Math.max(labelDistance, Math.min(ledAt + LED_TO_LABEL, length * MAX_FRACTION)), halfWidth, halfHeight)
  return { led, label }
}
