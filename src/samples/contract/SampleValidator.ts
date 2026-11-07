import { StateInvariants, type NetworkState } from '../../domain'
import { Cidr } from '../../design'
import { SAMPLE_CATEGORIES, SAMPLE_STEP_LIMITS } from './sampleCatalogue'
import type { SampleDefinition, SampleLink, StepCheck } from './SampleTypes'
import { leafChecks, linkEndPorts, solveConditionDevices, StepChecker } from './StepChecker'

export type SampleIssueCode =
  /** An id (sample, step, break-it idea, group) is not camelCase. */
  | 'badId'
  | 'duplicateSampleId'
  | 'duplicateStepId'
  | 'duplicateBreakItId'
  | 'duplicateGroupId'
  /** Two samples of one category share an `order`. */
  | 'duplicateOrder'
  | 'unknownCategory'
  /** Fewer or more steps than SAMPLE_STEP_LIMITS. */
  | 'stepCount'
  | 'noBreakIt'
  /** The lab breaks a StateInvariants rule (`detail` = invariant code). */
  | 'invalidLab'
  /** A device of the lab has no canvas position. */
  | 'missingPosition'
  /** The factory returned the same state object twice (must build a fresh lab per call). */
  | 'sharedLab'
  /** A check, group or focus names a device that is not in the lab (`detail` = device id). */
  | 'unknownDevice'
  /** A `hasAddress` / `addressPlan` prefix is not valid CIDR. */
  | 'badPrefix'
  /** A `nativeVlanMatch` cable is not in the lab (`detail` = link id). */
  | 'unknownLink'
  /** A `nativeVlanMatch` cable does not join two switchports (`detail` = link id). */
  | 'notSwitchLink'
  /** A related link points to an unknown exercise / brief / sample, or to the sample itself. */
  | 'badRelated'

export interface SampleIssue {
  code: SampleIssueCode
  sampleId: string
  stepId?: string
  detail?: string
}

/** Known ids for the related-link check; a list left out is not checked. */
export interface SampleValidationContext {
  exerciseIds?: readonly string[]
  briefIds?: readonly string[]
  sampleIds?: readonly string[]
}

const CAMEL_CASE = /^[a-z][A-Za-z0-9]*$/

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) (seen.has(value) ? repeated : seen).add(value)
  return [...repeated]
}

/** Structural checks of sample definitions (used by the content tests; never at runtime). */
export class SampleValidator {
  private readonly invariants = new StateInvariants()
  private readonly context: SampleValidationContext

  constructor(context: SampleValidationContext = {}) {
    this.context = context
  }

  /** Every issue of every sample plus catalogue-wide ones (duplicate ids / orders). */
  validateAll(samples: readonly SampleDefinition[]): SampleIssue[] {
    const context = { ...this.context, sampleIds: this.context.sampleIds ?? samples.map((sample) => sample.id) }
    const validator = new SampleValidator(context)
    const issues = samples.flatMap((sample) => validator.validate(sample))
    for (const id of duplicates(samples.map((sample) => sample.id))) issues.push({ code: 'duplicateSampleId', sampleId: id })
    for (const category of SAMPLE_CATEGORIES) {
      const members = samples.filter((sample) => sample.category === category.id)
      for (const order of duplicates(members.map((sample) => String(sample.order)))) {
        const sampleId = members.find((sample) => String(sample.order) === order)?.id ?? ''
        issues.push({ code: 'duplicateOrder', sampleId, detail: order })
      }
    }
    return issues
  }

  validate(sample: SampleDefinition): SampleIssue[] {
    const issues: SampleIssue[] = []
    const add = (code: SampleIssueCode, extra: Omit<SampleIssue, 'code' | 'sampleId'> = {}): void => {
      issues.push({ code, sampleId: sample.id, ...extra })
    }
    const groups = sample.groups ?? []
    const ids = [sample.id, ...sample.steps.map((step) => step.id), ...sample.breakIt, ...groups.map((group) => group.id)]
    for (const id of ids.filter((value) => !CAMEL_CASE.test(value))) add('badId', { detail: id })
    if (!SAMPLE_CATEGORIES.some((category) => category.id === sample.category)) add('unknownCategory', { detail: sample.category })
    const stepCount = sample.steps.length
    if (stepCount < SAMPLE_STEP_LIMITS.min || stepCount > SAMPLE_STEP_LIMITS.max) add('stepCount', { detail: String(stepCount) })
    for (const id of duplicates(sample.steps.map((step) => step.id))) add('duplicateStepId', { stepId: id })
    for (const id of duplicates(sample.breakIt)) add('duplicateBreakItId', { detail: id })
    for (const id of duplicates(groups.map((group) => group.id))) add('duplicateGroupId', { detail: id })
    if (sample.breakIt.length === 0) add('noBreakIt')
    const lab = sample.lab()
    if (sample.lab().state === lab.state) add('sharedLab')
    for (const violation of this.invariants.violations(lab.state)) add('invalidLab', { detail: violation.code })
    for (const device of lab.state.devices) {
      if (!lab.layout.devices[device.id]) add('missingPosition', { detail: device.id })
    }
    this.checkReferences(sample, lab.state, add)
    for (const link of sample.related) {
      if (!this.relatedOk(sample.id, link)) add('badRelated', { detail: JSON.stringify(link) })
    }
    return issues
  }

  private checkReferences(sample: SampleDefinition, state: NetworkState, add: (code: SampleIssueCode, extra?: Omit<SampleIssue, 'code' | 'sampleId'>) => void): void {
    const present = new Set(state.devices.map((device) => device.id))
    const unknown = (deviceId: string, stepId?: string): void => {
      if (!present.has(deviceId)) add('unknownDevice', { stepId, detail: deviceId })
    }
    // Declared and implicit (single-device) groups must name devices of the lab.
    for (const group of StepChecker.groupsOf(sample)) group.deviceIds.forEach((id) => unknown(id))
    for (const step of sample.steps) {
      if (step.focusDeviceId !== undefined) unknown(step.focusDeviceId, step.id)
      for (const check of (step.checks ?? []).flatMap(leafChecks)) {
        for (const deviceId of SampleValidator.checkDevices(check)) unknown(deviceId, step.id)
        const prefix = SampleValidator.checkPrefix(check)
        if (prefix !== undefined && Cidr.parse(prefix) === null) add('badPrefix', { stepId: step.id, detail: prefix })
        if (check.type === 'nativeVlanMatch') SampleValidator.checkLink(state, check.linkId, (code) => add(code, { stepId: step.id, detail: check.linkId }))
      }
    }
  }

  /** The cable exists and joins two switchports (trunk mode may be the learner's job). */
  private static checkLink(state: NetworkState, linkId: string, add: (code: SampleIssueCode) => void): void {
    if (!state.links.some((link) => link.id === linkId)) {
      add('unknownLink')
      return
    }
    const ends = linkEndPorts(state, linkId)
    if (!ends?.every((port) => port.role === 'switched')) add('notSwitchLink')
  }

  private static checkDevices(check: StepCheck): string[] {
    switch (check.type) {
      case 'solve':
        return solveConditionDevices(check.condition)
      case 'hasAddress':
        return [check.deviceId]
      case 'network':
      case 'nativeVlanMatch':
      case 'not':
        return []
    }
  }

  private static checkPrefix(check: StepCheck): string | undefined {
    if (check.type === 'hasAddress') return check.prefix
    if (check.type === 'network' && check.condition.type === 'addressPlan') return check.condition.prefix
    return undefined
  }

  private relatedOk(sampleId: string, link: SampleLink): boolean {
    const known = (list: readonly string[] | undefined, id: string): boolean => list === undefined || list.includes(id)
    switch (link.kind) {
      case 'exercise':
        return known(this.context.exerciseIds, link.exerciseId)
      case 'design':
        return known(this.context.briefIds, link.briefId)
      case 'sample':
        return link.sampleId !== sampleId && known(this.context.sampleIds, link.sampleId)
    }
  }
}
