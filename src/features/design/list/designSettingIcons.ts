import { Building, Factory, Hotel, School, Store, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { DesignSetting } from '../../../domain'

/** Icon of each brief setting; the label is translated as `design:settings.<setting>`. */
export const designSettingIcons: Record<DesignSetting, LucideIcon> = {
  restaurant: UtensilsCrossed,
  office: Building,
  shop: Store,
  school: School,
  factory: Factory,
  hotel: Hotel,
}
