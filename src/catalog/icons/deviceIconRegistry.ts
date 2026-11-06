// Icon of every device kind: the catalog's own network-gear icons plus lucide icons for end devices.
import { Cctv, ChefHat, CreditCard, HardDrive, Laptop, Monitor, Phone, Printer, Server, Smartphone, Tablet, Tv } from 'lucide-react'
import type { DeviceKind } from '../../domain'
import type { DeviceIcon } from './deviceIconTypes'
import {
  AccessPointIcon,
  HubIcon,
  InternetCloudIcon,
  L3SwitchIcon,
  RouterIcon,
  SwitchIcon,
  WirelessRouterIcon,
} from './NetworkDeviceIcons'

export const deviceIconRegistry: Readonly<Record<DeviceKind, DeviceIcon>> = {
  internet: InternetCloudIcon,
  router: RouterIcon,
  wirelessRouter: WirelessRouterIcon,
  switch: SwitchIcon,
  l3Switch: L3SwitchIcon,
  hub: HubIcon,
  accessPoint: AccessPointIcon,
  pc: Monitor,
  laptop: Laptop,
  server: Server,
  printer: Printer,
  ipPhone: Phone,
  pos: CreditCard,
  camera: Cctv,
  nvr: HardDrive,
  kitchenDisplay: ChefHat,
  smartphone: Smartphone,
  tablet: Tablet,
}

/** Icon component for a device kind (workspace palette, canvas, device panel, map). */
export function deviceIconFor(kind: DeviceKind): DeviceIcon {
  return deviceIconRegistry[kind]
}

/** Models whose icon differs from their kind's (a smart TV is a 'kitchenDisplay' kind device). */
export const modelIconOverrides = { smartTv: Tv } as const satisfies Readonly<Record<string, DeviceIcon>>

export type ModelWithOwnIcon = keyof typeof modelIconOverrides

export function hasOwnModelIcon(modelId: string | undefined): modelId is ModelWithOwnIcon {
  return modelId !== undefined && Object.hasOwn(modelIconOverrides, modelId)
}

/** Icon of a device of 'kind' created from model 'modelId' (the kind's icon unless overridden). */
export function deviceIconForModel(kind: DeviceKind, modelId: string | undefined): DeviceIcon {
  return hasOwnModelIcon(modelId) ? modelIconOverrides[modelId] : deviceIconRegistry[kind]
}
