// Sample lab contract (docs/SAMPLE_LABS.md §Contract): a sample is a ready, working lab plus a mini
// lesson. Data and a lab factory only; every text lives in the `samples` namespace under
// `samples:labs.<sampleId>.*` (layout in docs/SAMPLE_LABS.md). Checked by StepChecker, validated by
// SampleValidator, listed by SampleCatalog.
import type { Annotation, DeviceGroup, LabLayout, NetworkCondition, NetworkState, SolveCondition } from '../../domain'

/** Catalogue rows of docs/SAMPLE_LABS.md, in display order (texts: `samples:categories.<id>.*`). */
export type SampleCategoryId =
  | 'basics'
  | 'dhcp'
  | 'dns'
  | 'switching'
  | 'routing'
  | 'packetView'
  | 'deviceCli'
  | 'switchingAdvanced'
  | 'security'
  | 'dynamicRouting'
  | 'ipv6'
  | 'servers'
  | 'wireless'
  | 'wanSecurity'
  | 'operations'
  | 'industrial'

/** Text: `samples:levels.<level>`. */
export type SampleLevel = 'beginner' | 'intermediate' | 'advanced'

/**
 * App features a sample needs beyond the always-present core (cards show them, the catalogue hides
 * samples whose features are not available yet; text: `samples:features.<feature>`). Every pack adds
 * its own features here and in SAMPLE_FEATURE_AVAILABILITY.
 */
export type SampleFeature =
  /** Simulation mode (Phase 3): event list, PDU inspector, step-by-step packets. */
  | 'simulation'
  /** DHCP relay (`ip helper-address`, Phase 3). The rule engine does not relay: checks must be manual. */
  | 'dhcpRelay'
  /** DNS forwarders / multi-level DNS (Phase 3). */
  | 'dnsForwarding'
  /** Switch and router command line (Phase 4). */
  | 'deviceCli'

/**
 * An automatic check of a "try this" step, evaluated on the current lab state by StepChecker with the
 * rule engine (`networkEngine`). Simulation-only observations ("watch the ARP request") have no check:
 * the learner ticks them off (manual step).
 */
export type StepCheck =
  /** An exercise solve condition (`internet`, `resolves`, `reachable`, `appLinksOk`). */
  | { type: 'solve'; condition: SolveCondition }
  /**
   * A design network condition (`reachable`, `notReachable`, `internet`, `resolves`, `dhcpServes`,
   * `separateSubnets`, `sameVlan`, `addressPlan`) on the state as it is (no DHCP settling). Group ids
   * are `SampleDefinition.groups` ids; an id that is not a declared group names one device (its id).
   */
  | { type: 'network'; condition: NetworkCondition }
  /** The device has an IPv4 address (inside `prefix`, CIDR, when given; e.g. '169.254.0.0/16'). */
  | { type: 'hasAddress'; deviceId: string; prefix?: string }
  /** Holds when `check` does not hold (e.g. "PC1 can no longer reach PC2"). */
  | { type: 'not'; check: StepCheck }

/** One guided "try this" step. Texts: `samples:labs.<sampleId>.steps.<stepId>.{title,detail}`. */
export interface SampleStep {
  /** camelCase, unique in the sample; also its text key and its progress key. */
  id: string
  /** All must hold for the step to pass automatically. Absent or [] = manual step (learner ticks it). */
  checks?: readonly StepCheck[]
  /** The step is done in Simulation mode (the lesson panel offers to switch to it). */
  mode?: 'simulation'
  /** Device the step is about; the lesson panel can select / highlight it. */
  focusDeviceId?: string
}

/** Another place to go after the sample (texts come from the target's own namespace). */
export type SampleLink =
  | { kind: 'exercise'; exerciseId: string }
  | { kind: 'design'; briefId: string }
  | { kind: 'sample'; sampleId: string }

/** What the factory returns; opening a sample turns it into a free LabDocument (see openSampleLab). */
export interface SampleLab {
  state: NetworkState
  layout: LabLayout
  annotations?: Annotation[]
}

/**
 * Data-only sample lab. Device names in the lab are final, language-neutral hostnames (PC1, SW1,
 * R1, DNS1): they are user content once opened and are not translated. Texts (title, summary,
 * intro, steps, break-it ideas, topics) are `samples:labs.<id>.*` keys.
 */
export interface SampleDefinition {
  /** camelCase; also the key of the sample in `samples:labs` and the `/samples/<id>` path segment. */
  id: string
  category: SampleCategoryId
  /** Order inside its category (ascending). */
  order: number
  level: SampleLevel
  /** Features beyond the core; [] = works with the core only. */
  features: readonly SampleFeature[]
  /** Builds a fresh, working lab (new objects on every call). */
  lab: () => SampleLab
  /** Named device sets for `network` checks (DeviceGroup.name is a placeholder = id, never shown). */
  groups?: readonly DeviceGroup[]
  /** 3–5 guided "try this" steps, in order. */
  steps: readonly SampleStep[]
  /** "Break it" idea ids, in order (texts: `samples:labs.<id>.breakIt.<ideaId>.{change,result}`). */
  breakIt: readonly string[]
  related: readonly SampleLink[]
}

/** Live status of one step on the current lab state. */
export type StepStatus =
  | { stepId: string; kind: 'manual' }
  | { stepId: string; kind: 'auto'; ok: boolean; checks: readonly CheckResult[] }

export interface CheckResult {
  check: StepCheck
  ok: boolean
}

/** Learner progress of one sample (persisted; the learning path will read it later, BACKLOG 9). */
export interface SampleProgress {
  sampleId: string
  /** Step ids done (auto-passed once or ticked); stays done when the learner breaks the lab later. */
  doneStepIds: string[]
  /** ISO 8601. */
  updatedAt: string
  /** ISO 8601; set when every step of the sample was done. */
  completedAt?: string
}

/** Texts of one sample in the active language (SampleTextReader). */
export interface SampleTexts {
  title: string
  /** One line for the card. */
  summary: string
  intro: { what: string; why: string; realWorld: string }
  steps: { id: string; title: string; detail: string }[]
  breakIt: { id: string; change: string; result: string }[]
  topics: string[]
}
