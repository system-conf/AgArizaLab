// The design briefs (docs/DESIGN_EXERCISES.md §4) as data, in list order. Texts live in the
// `designBriefs` namespace keyed by the brief id (coordinator decision 2).
import type { DesignExerciseDefinition } from '../../domain'
import { factoryBrief } from './factory'
import { hotelBrief } from './hotel'
import { restaurantBrief } from './restaurant'
import { schoolLabBrief } from './schoolLab'
import { smallOfficeBrief } from './smallOffice'

export const designExercises: readonly DesignExerciseDefinition[] = [
  smallOfficeBrief(),
  restaurantBrief(),
  schoolLabBrief(),
  factoryBrief(),
  hotelBrief(),
]
