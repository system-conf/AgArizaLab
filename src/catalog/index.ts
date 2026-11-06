// Device catalog (docs/MODEL_V2.md §7, owner C1): models, device creation, icons, port strips.
export { DEVICE_CATEGORIES, DeviceCatalog, deviceCatalog, findDeviceModel, modelDescriptionKey, modelsInCategory } from './DeviceCatalog'
export {
  CATALOG_SECTIONS,
  DEVICE_SUBCATEGORIES,
  sectionOfModel,
  sectionOfSubcategory,
  sectionsWithModels,
  subcategoriesWithModels,
  type CatalogSection,
} from './catalogSections'
export type { CatalogDeviceModel } from './models/defineModel'
export { PortSummary, type PortSummaryInfo, type PortSummaryPart, type PortSummaryQualifier, type PortSummaryType } from './PortSummary'
export { WIRELESS_ROUTER_WAN_PORT } from './models/wireless'
export { isPortGroup, PORT_GROUPS, type CatalogPortTemplate, type PortGroup } from './portTemplates'
export { PortFactory, type CreateDeviceOptions } from './PortFactory'
export { DEFAULT_SSID, DeviceDefaults, HOME_ROUTER_LAN, type DeviceSettingsGroups } from './DeviceDefaults'
export { RandomBaseMacSource, SeededBaseMacSource, type BaseMacSource } from './BaseMacSource'
export { PortStrip, TWO_ROW_THRESHOLD, type PortStripGroup, type PortStripLayout, type PortStripSection } from './PortStrip'
export { deviceIconFor, deviceIconForModel, deviceIconRegistry, modelIconOverrides } from './icons/deviceIconRegistry'
export { DeviceKindIcon } from './icons/DeviceKindIcon'
export type { DeviceIcon, DeviceIconProps } from './icons/deviceIconTypes'
export {
  AccessPointIcon,
  HubIcon,
  InternetCloudIcon,
  L3SwitchIcon,
  RouterIcon,
  SwitchIcon,
  WirelessRouterIcon,
} from './icons/NetworkDeviceIcons'
