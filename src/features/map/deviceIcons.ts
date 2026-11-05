import {
  Cctv,
  ChefHat,
  CreditCard,
  Globe,
  HardDrive,
  Monitor,
  Network,
  Printer,
  Router,
  Smartphone,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import type { DeviceKind } from '../../domain/NetworkTypes'

/** Icon shown for each device kind on the map and in the device panel. */
export const deviceIcons: Record<DeviceKind, LucideIcon> = {
  internet: Globe,
  router: Router,
  switch: Network,
  accessPoint: Wifi,
  pc: Monitor,
  pos: CreditCard,
  printer: Printer,
  camera: Cctv,
  nvr: HardDrive,
  kitchenDisplay: ChefHat,
  phone: Smartphone,
}
