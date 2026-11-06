// The views of the device palette and their names.
import { useTranslation } from 'react-i18next'
import type { DeviceSubcategory } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import type { CatalogSection } from '../labServices'

/** What the palette shows: a catalog section, the cable tools, favourites or recent models. */
export type PaletteView = CatalogSection | 'cables' | 'favourites' | 'recent'

/** Sub-category filter of a section view. */
export type SubcategoryChoice = DeviceSubcategory | 'all'

export function isCatalogSection(view: PaletteView): view is CatalogSection {
  return view !== 'cables' && view !== 'favourites' && view !== 'recent'
}

/** Translated name of a palette view. */
export function usePaletteViewName(): (view: PaletteView) => string {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  return (view) => (isCatalogSection(view) ? translate({ key: `catalog:sections.${view}` }) : t(`palette.sections.${view}`))
}
