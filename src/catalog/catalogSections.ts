// Two-level palette structure of the catalog (BACKLOG item 1): top-level sections, each with its
// sub-categories in palette order. A section or sub-category without models is hidden by the UI
// (IoT / industrial and misc are reserved for the packs; 'security' waits for the firewall pack).
import type { DeviceModel, DeviceSubcategory } from '../domain'

/** Top level of the device palette (cables are a palette tool, not a catalog section). */
export type CatalogSection = 'network' | 'endDevices' | 'iot' | 'misc'

/** Section of every sub-category (exhaustive: a new sub-category must be placed here). */
const SECTION_OF: Readonly<Record<DeviceSubcategory, CatalogSection>> = {
  router: 'network',
  switch: 'network',
  hub: 'network',
  wireless: 'network',
  security: 'network',
  wanIsp: 'network',
  pcLaptop: 'endDevices',
  server: 'endDevices',
  printer: 'endDevices',
  phoneTablet: 'endDevices',
  cameraNvr: 'endDevices',
  posDisplay: 'endDevices',
}

/** Palette order of the sections. */
export const CATALOG_SECTIONS: readonly CatalogSection[] = ['network', 'endDevices', 'iot', 'misc']

/** Palette order of the sub-categories. */
export const DEVICE_SUBCATEGORIES: readonly DeviceSubcategory[] = [
  'router',
  'switch',
  'hub',
  'wireless',
  'security',
  'wanIsp',
  'pcLaptop',
  'server',
  'printer',
  'phoneTablet',
  'cameraNvr',
  'posDisplay',
]

export function sectionOfSubcategory(subcategory: DeviceSubcategory): CatalogSection {
  return SECTION_OF[subcategory]
}

export function sectionOfModel(model: DeviceModel): CatalogSection {
  return SECTION_OF[model.subcategory]
}

/** Sub-categories of a section that have at least one of the given models, in palette order. */
export function subcategoriesWithModels(section: CatalogSection, models: readonly DeviceModel[]): DeviceSubcategory[] {
  return DEVICE_SUBCATEGORIES.filter(
    (subcategory) => SECTION_OF[subcategory] === section && models.some((model) => model.subcategory === subcategory),
  )
}

/** Sections that have at least one of the given models, in palette order. */
export function sectionsWithModels(models: readonly DeviceModel[]): CatalogSection[] {
  return CATALOG_SECTIONS.filter((section) => models.some((model) => sectionOfModel(model) === section))
}
