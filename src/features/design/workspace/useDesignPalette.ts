import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CatalogFilterPolicy, PriceCatalog } from '../../../design'
import type { DesignExerciseDefinition, DeviceModel } from '../../../domain'
import { deviceCatalog } from '../../workspace/labServices'

export interface DesignPalette {
  /** Catalog models the brief allows (`allowedModels`). */
  models: readonly DeviceModel[]
  /** "180 units" for a model tile; undefined when the brief has no budget (no prices shown). */
  priceLabelOf: ((modelId: string) => string | undefined) | undefined
}

/** Palette of the design mode: filtered by CatalogFilterPolicy, with prices when there is a budget. */
export function useDesignPalette(brief: Pick<DesignExerciseDefinition, 'allowedModels' | 'budget'>, prices = PriceCatalog.default): DesignPalette {
  const { t } = useTranslation('design')
  const models = useMemo(() => {
    const policy = new CatalogFilterPolicy(brief.allowedModels)
    return deviceCatalog.filter((model) => policy.allows(model))
  }, [brief.allowedModels])
  const byId = useMemo(() => new Map(models.map((model) => [model.id, model])), [models])
  const label = useCallback(
    (modelId: string) => {
      const model = byId.get(modelId)
      return model === undefined ? undefined : t('units.price', { amount: prices.priceOfModel(model.id, model.kind) })
    },
    [byId, prices, t],
  )
  return { models, priceLabelOf: brief.budget === undefined ? undefined : label }
}
