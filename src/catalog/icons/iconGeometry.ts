// Small path builders for the device icons (24×24 grid).

export type IconPoint = readonly [number, number]

function rounded(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** Open chevron head pointing at `tip`, coming from the direction of `from`. */
function headPath(from: IconPoint, tip: IconPoint, head: number, spread: number): string {
  const [fromX, fromY] = from
  const [tipX, tipY] = tip
  const length = Math.hypot(tipX - fromX, tipY - fromY)
  if (length === 0) throw new Error('An icon arrow needs two different points')
  const unitX = (tipX - fromX) / length
  const unitY = (tipY - fromY) / length
  const baseX = tipX - unitX * head
  const baseY = tipY - unitY * head
  const normalX = -unitY * spread
  const normalY = unitX * spread
  return `M${rounded(baseX + normalX)} ${rounded(baseY + normalY)}L${rounded(tipX)} ${rounded(tipY)}L${rounded(baseX - normalX)} ${rounded(baseY - normalY)}`
}

function linePath(from: IconPoint, to: IconPoint): string {
  return `M${rounded(from[0])} ${rounded(from[1])}L${rounded(to[0])} ${rounded(to[1])}`
}

/** Path data of a straight arrow from `from` to `to` (`head` = head length, `spread` = half its width). */
export function arrowPath(from: IconPoint, to: IconPoint, head = 1.8, spread = 1.2): string {
  return linePath(from, to) + headPath(from, to, head, spread)
}

/** Path data of a double-headed arrow between two points. */
export function doubleArrowPath(from: IconPoint, to: IconPoint, head = 1.8, spread = 1.2): string {
  return linePath(from, to) + headPath(from, to, head, spread) + headPath(to, from, head, spread)
}
