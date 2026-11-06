import { Building, Store, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { ExerciseSetting } from '../../domain/v2'

/** Icon of each exercise setting; the label is translated as `landing:settings.<setting>`. */
export const settingIcons: Record<ExerciseSetting, LucideIcon> = {
  restaurant: UtensilsCrossed,
  office: Building,
  shop: Store,
}
