// Icon of every device kind: the catalog's own network-gear icons plus lucide icons for end devices.
import { Cctv, ChefHat, CreditCard, HardDrive, Laptop, Monitor, Phone, Printer, Server, Smartphone, Tablet } from 'lucide-react'
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
