import { Building, Store, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { ScenarioSetting } from '../../domain/ScenarioTypes'

/** Turkish label and icon of each scenario setting. */
export const settingLabels: Record<ScenarioSetting, { label: string; icon: LucideIcon }> = {
  restoran: { label: 'Restoran', icon: UtensilsCrossed },
  ofis: { label: 'Ofis', icon: Building },
  magaza: { label: 'Mağaza', icon: Store },
}
