// Shared helper of the catalog data files: fills in the model's i18n keys.
import type { DeviceModel } from '../../domain'
import type { CatalogPortTemplate } from '../portTemplates'

/** A catalog model: every port template carries a typed strip group. */
export interface CatalogDeviceModel extends DeviceModel {
  ports: readonly CatalogPortTemplate[]
}

export function defineModel(model: Omit<CatalogDeviceModel, 'nameKey' | 'useCaseKey'>): CatalogDeviceModel {
  return { ...model, nameKey: `catalog:models.${model.id}.name`, useCaseKey: `catalog:models.${model.id}.useCase` }
}
