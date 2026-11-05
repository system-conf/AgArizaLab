import { Building, Store, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { ScenarioSetting } from '../../domain/ScenarioTypes'

/** Icon of each scenario setting; the label is translated as `landing:settings.<setting>`. */
export const settingIcons: Record<ScenarioSetting, LucideIcon> = {
  restoran: UtensilsCrossed,
  ofis: Building,
  magaza: Store,
}
