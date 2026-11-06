import type { Device, Link } from '../domain'
import { DEFAULT_PRICE_LIST, type PriceList } from './prices'

/** Price lookups of a PriceList: by model id, falling back to the device kind (see prices.ts). */
export class PriceCatalog {
  static readonly default = new PriceCatalog(DEFAULT_PRICE_LIST)

  readonly list: PriceList

  constructor(list: PriceList) {
    this.list = list
  }

  /** Price of one device of `modelId` (kind fallback for models without an entry). */
  priceOfModel(modelId: string, kind: Device['kind']): number {
    return this.list.models[modelId] ?? this.list.kinds[kind]
  }

  priceOfDevice(device: Pick<Device, 'modelId' | 'kind'>): number {
    return this.priceOfModel(device.modelId, device.kind)
  }

  priceOfLink(link: Pick<Link, 'cable'>): number {
    return this.list.cables[link.cable]
  }
}
