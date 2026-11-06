// Design exercises (docs/DESIGN_EXERCISES.md): requirement checking, review, prices. Pure; import
// from 'src/design' rather than the single files. Types of the brief live in src/domain/ExerciseTypes.
export { CatalogFilterPolicy } from './CatalogFilterPolicy'
export { Cidr, type CidrBlock } from './Cidr'
export { DesignBriefValidator, type BriefIssue, type BriefIssueCode } from './DesignBriefValidator'
export { DesignInventory, type CableCostLine, type CostSummary, type DeviceCostLine, type DeviceCounts } from './DesignInventory'
export { DesignLabels } from './DesignLabels'
export { DesignReview, type DesignReviewBrief, type DesignReviewReport, type DesignScore, type SinglePointOfFailure } from './DesignReview'
export { DhcpSettler } from './DhcpSettler'
export { FailureScenarios, type FailureCase } from './FailureScenarios'
export { GroupMembers, type ResolvedGroup } from './GroupMembers'
export { conditionGroups, NetworkConditionEvaluator, type ConditionOutcome, type RequirementMeasure } from './NetworkConditionEvaluator'
export { PriceCatalog } from './PriceCatalog'
export { DEFAULT_PRICE_LIST, type PriceList } from './prices'
export {
  RequirementChecker,
  type DesignRules,
  type PreparedState,
  type RequirementCheckerOptions,
  type RequirementOutcome,
  type RequirementResult,
} from './RequirementChecker'
export { RequirementDescriber, type RequirementText } from './RequirementDescriber'
export {
  ReviewDetails,
  type BudgetReview,
  type KindCount,
  type ReviewedRequirement,
  type ReviewHintText,
  type ReviewPresentation,
  type ReviewStatus,
} from './ReviewDetails'
export { isLimit, ReviewScoring } from './ReviewScoring'
export { HandoverPack, type HandoverBrief, type HandoverOptions, type HandoverSource } from './handover/HandoverPack'
export { HandoverLayout } from './handover/HandoverLayout'
export { HandoverMarkdown } from './handover/HandoverMarkdown'
export { PortRanges } from './handover/PortRanges'
export type * from './handover/HandoverTypes'
