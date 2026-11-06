import type { CableType, Device, DeviceKind, Link, NetworkState } from '../domain'
import { PriceCatalog } from './PriceCatalog'

/** Devices of one model in the quotation. */
export interface DeviceCostLine {
  modelId: string
  kind: DeviceKind
  count: number
  unitPrice: number
  subtotal: number
}

export interface CableCostLine {
  cable: CableType
  count: number
  unitPrice: number
  subtotal: number
}

/** What the learner's additions cost (the quotation, "teklif"). Lines sorted by subtotal, highest first. */
export interface CostSummary {
  total: number
  devices: DeviceCostLine[]
  cables: CableCostLine[]
}

export interface DeviceCounts {
  /** Customer devices of the starting lab still in the lab. */
  provided: number
  /** Devices the learner added. */
  added: number
  addedByKind: Partial<Record<DeviceKind, number>>
}

/**
 * Separates the customer's devices (the starting lab) from what the learner added and prices the
 * additions. Devices and links are "added" when their id is not in the starting lab.
 */
export class DesignInventory {
  private readonly providedDeviceIds: ReadonlySet<string>
  private readonly providedLinkIds: ReadonlySet<string>
  private readonly prices: PriceCatalog

  constructor(startingState: NetworkState, prices: PriceCatalog = PriceCatalog.default) {
    this.providedDeviceIds = new Set(startingState.devices.map((device) => device.id))
    this.providedLinkIds = new Set(startingState.links.map((link) => link.id))
    this.prices = prices
  }

  isProvided(deviceId: string): boolean {
    return this.providedDeviceIds.has(deviceId)
  }

  addedDevices(state: NetworkState): Device[] {
    return state.devices.filter((device) => !this.providedDeviceIds.has(device.id))
  }

  addedLinks(state: NetworkState): Link[] {
    return state.links.filter((link) => !this.providedLinkIds.has(link.id))
  }

  cost(state: NetworkState): CostSummary {
    const devices = new Map<string, DeviceCostLine>()
    for (const device of this.addedDevices(state)) {
      const unitPrice = this.prices.priceOfDevice(device)
      const line = devices.get(device.modelId) ?? { modelId: device.modelId, kind: device.kind, count: 0, unitPrice, subtotal: 0 }
      devices.set(device.modelId, { ...line, count: line.count + 1, subtotal: line.subtotal + unitPrice })
    }
    const cables = new Map<CableType, CableCostLine>()
    for (const link of this.addedLinks(state)) {
      const unitPrice = this.prices.priceOfLink(link)
      const line = cables.get(link.cable) ?? { cable: link.cable, count: 0, unitPrice, subtotal: 0 }
      cables.set(link.cable, { ...line, count: line.count + 1, subtotal: line.subtotal + unitPrice })
    }
    const deviceLines = [...devices.values()].sort((a, b) => b.subtotal - a.subtotal)
    const cableLines = [...cables.values()].sort((a, b) => b.subtotal - a.subtotal)
    const total = [...deviceLines, ...cableLines].reduce((sum, line) => sum + line.subtotal, 0)
    return { total, devices: deviceLines, cables: cableLines }
  }

  /** Total price of the additions (same as `cost(state).total`, without building lines). */
  totalCost(state: NetworkState): number {
    const devices = this.addedDevices(state).reduce((sum, device) => sum + this.prices.priceOfDevice(device), 0)
    return this.addedLinks(state).reduce((sum, link) => sum + this.prices.priceOfLink(link), devices)
  }

  counts(state: NetworkState): DeviceCounts {
    const added = this.addedDevices(state)
    const addedByKind: Partial<Record<DeviceKind, number>> = {}
    for (const device of added) addedByKind[device.kind] = (addedByKind[device.kind] ?? 0) + 1
    return { provided: state.devices.length - added.length, added: added.length, addedByKind }
  }
}
