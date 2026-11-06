import { LabIndex } from './LabIndex'

/** Splits 'Fa0/12' into 'Fa0/' and 12; ids without a trailing number have no number. */
function split(portId: string): { stem: string; number?: number } {
  const match = /^(.*?)(\d+)$/.exec(portId)
  if (!match || match[1] === undefined || match[2] === undefined) return { stem: portId }
  return { stem: match[1], number: Number(match[2]) }
}

/** Compact port lists for tables: 'Fa0/2–Fa0/5, Fa0/7, Gi0/1'. */
export class PortRanges {
  static compress(portIds: readonly string[]): string {
    const sorted = [...new Set(portIds)].sort(LabIndex.comparePorts)
    const parts: string[] = []
    let runStart: string | undefined
    let runEnd: string | undefined
    for (const portId of sorted) {
      if (runStart !== undefined && runEnd !== undefined && PortRanges.follows(runEnd, portId)) {
        runEnd = portId
        continue
      }
      if (runStart !== undefined && runEnd !== undefined) parts.push(PortRanges.run(runStart, runEnd))
      runStart = portId
      runEnd = portId
    }
    if (runStart !== undefined && runEnd !== undefined) parts.push(PortRanges.run(runStart, runEnd))
    return parts.join(', ')
  }

  private static follows(previous: string, next: string): boolean {
    const a = split(previous)
    const b = split(next)
    return a.stem === b.stem && a.number !== undefined && b.number === a.number + 1
  }

  private static run(start: string, end: string): string {
    return start === end ? start : `${start}–${end}`
  }
}
