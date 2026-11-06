// Sample lab contract (SL0, docs/SAMPLE_LABS.md §Contract). Import from 'src/samples' (or this folder).
export type * from './SampleTypes'
export {
  SAMPLE_CATEGORIES,
  SAMPLE_FEATURE_AVAILABILITY,
  SAMPLE_LEVELS,
  SAMPLE_PROGRESS_STORAGE_KEY,
  SAMPLE_STEP_LIMITS,
  type SampleCategory,
  type SampleDelivery,
} from './sampleCatalogue'
export { openSampleLab, SampleCatalog, type SampleCategoryGroup } from './SampleCatalog'
export { SampleProgressBook, type SampleCompletion, type SampleProgressData } from './SampleProgressBook'
export { SampleTextKeys } from './SampleTextKeys'
export { SampleTextReader } from './SampleTextReader'
export { SampleValidator, type SampleIssue, type SampleIssueCode, type SampleValidationContext } from './SampleValidator'
export {
  leafChecks,
  referencedGroupIds,
  solveConditionDevices,
  StepChecker,
  type SampleRules,
  type StepCheckerOptions,
} from './StepChecker'
