// Compact port summary of a model for the palette card, e.g. 24× Fa · 2× Gi uplink · PoE.
// Returns structured parts; the UI turns them into text (`workspace:palette.ports.*`).
import type { DeviceModel, PortTemplate } from '../domain'

/** Kind of port in a summary part. */
export type PortSummaryType = 'fastEthernet' | 'gigabit' | 'fiber' | 'serial' | 'coaxial' | 'wifiClient' | 'wifiRadio'

/** Where the ports sit, when the model's strip group says so. */
export type PortSummaryQualifier = 'lan' | 'wan' | 'uplink'

export interface PortSummaryPart {
  type: PortSummaryType
  count: number
  qualifier?: PortSummaryQualifier
}

export interface PortSummaryInfo {
  /** Groups of equal ports in the order their first port appears on the model. */
  parts: readonly PortSummaryPart[]
  /** Some port can source PoE. */
  poe: boolean
  /** The model has a console port. */
  console: boolean
}

const GIGABIT_MBPS = 1000

export class PortSummary {
  static forModel(model: DeviceModel): PortSummaryInfo {
    const parts: PortSummaryPart[] = []
    for (const port of model.ports) {
      const type = PortSummary.typeOf(port)
      if (type === null) continue
      const qualifier = PortSummary.qualifierOf(port.group)
      const existing = parts.find((part) => part.type === type && part.qualifier === qualifier)
      if (existing) existing.count += 1
      else parts.push({ type, count: 1, ...(qualifier === undefined ? {} : { qualifier }) })
    }
    return {
      parts,
      poe: model.ports.some((port) => port.poe === true),
      console: model.ports.some((port) => port.medium === 'console'),
    }
  }

  /** Summary type of a port; null for the console port (reported as a flag). */
  static typeOf(port: PortTemplate): PortSummaryType | null {
    switch (port.medium) {
      case 'console':
        return null
      case 'serial':
        return 'serial'
      case 'coaxial':
        return 'coaxial'
      case 'fiber':
        return 'fiber'
      case 'wireless':
        return port.role === 'radio' ? 'wifiRadio' : 'wifiClient'
      case 'copper':
        return Math.max(0, ...port.speedsMbps) >= GIGABIT_MBPS ? 'gigabit' : 'fastEthernet'
    }
  }

  private static qualifierOf(group: string | undefined): PortSummaryQualifier | undefined {
    return group === 'lan' || group === 'wan' || group === 'uplink' ? group : undefined
  }
}
