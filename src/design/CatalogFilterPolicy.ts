import type { CatalogFilter, DeviceModel } from '../domain'

/** Which catalog models a brief's palette offers (`DesignExerciseDefinition.allowedModels`). */
export class CatalogFilterPolicy {
  static readonly everything = new CatalogFilterPolicy(undefined)

  private readonly filter: CatalogFilter | undefined

  constructor(filter: CatalogFilter | undefined) {
    this.filter = filter
  }

  /** No filter, or the model's category or id is listed. */
  allows(model: Pick<DeviceModel, 'id' | 'category'>): boolean {
    if (this.filter === undefined) return true
    return (this.filter.categories ?? []).includes(model.category) || (this.filter.modelIds ?? []).includes(model.id)
  }
}
