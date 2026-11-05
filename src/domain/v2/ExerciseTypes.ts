// v2 exercise contract (MODEL_V2 §10): an exercise is a locked lab plus solve conditions.
// Data only; every text lives in the `exercises` namespace keyed by the exercise id (docs/I18N.md §5).
import type { LabLayout } from './LabDocument'
import type { NetworkStateV2 } from './NetworkStateV2'

/** Business setting of the story (card icon, `landing:settings.<setting>`). */
export type ExerciseSetting = 'restaurant' | 'office' | 'shop'

export type SolveConditionV2 =
  /** fromDeviceId can ping an internet address (8.8.8.8). */
  | { type: 'internet'; fromDeviceId: string }
  /** fromDeviceId can resolve `name` through its DNS settings. */
  | { type: 'resolves'; fromDeviceId: string; name: string }
  /** fromDeviceId can reach the current address of toDeviceId. */
  | { type: 'reachable'; fromDeviceId: string; toDeviceId: string }
  /** Every AppLink on deviceId reports ok. */
  | { type: 'appLinksOk'; deviceId: string }

/** Settings areas of a device that can be locked as a whole. 'terminal' is the command prompt / CLI. */
export type DeviceSection =
  | 'power'
  | 'ports'
  | 'host'
  | 'switching'
  | 'routing'
  | 'wireless'
  | 'services'
  | 'internet'
  | 'terminal'

/** readOnly = shown but not editable; hidden = not shown at all (the learner must find it another way). */
export type LockAccess = 'readOnly' | 'hidden'

/** Restrictions of an exercise lab. Anything not locked is editable. */
export type ExerciseLock =
  /** No devices or links may be added, deleted or moved. */
  | { scope: 'topology' }
  /** The link may not be deleted or unplugged. */
  | { scope: 'link'; linkId: string }
  /** Every setting of the device. */
  | { scope: 'device'; deviceId: string; access: LockAccess }
  | { scope: 'section'; deviceId: string; section: DeviceSection; access: LockAccess }
  /** One port (its l2 / l3 settings, adminUp, sub-interfaces). */
  | { scope: 'port'; deviceId: string; portId: string; access: LockAccess }

/** Network and canvas of an exercise; opening the exercise turns it into a LabDocument. */
export interface ExerciseLab {
  state: NetworkStateV2
  layout: LabLayout
}

/**
 * Data-only exercise. Device names and AppLink labels in `lab.state` are placeholders (their ids),
 * localized from `exercises:<id>.devices.<deviceId>` / `.appLinks.<appLinkId>`. Title, complaint,
 * guide steps (`hints.0..2`), explanation and topics are `exercises:<id>.*` keys.
 */
export interface ExerciseDefinition {
  /** camelCase; also the key of the exercise in the `exercises` namespace. */
  id: string
  order: number
  setting: ExerciseSetting
  lab: ExerciseLab
  /** All must hold for the exercise to count as solved. */
  solvedWhen: SolveConditionV2[]
  locks: ExerciseLock[]
}

/** Texts of one exercise in the active language, read from `exercises:<id>.*`. */
export interface ExerciseTexts {
  title: string
  complaint: { from: string; message: string }
  /** Three guide steps: direction → location → answer (`hints.0..2`). */
  guide: [string, string, string]
  explanation: { whatHappened: string; realLife: string; interviewAnswer: string }
  topics: string[]
}

/** LOCALIZED exercise the UI consumes: the definition with device names / labels filled in, plus texts. */
export interface Exercise extends ExerciseDefinition {
  texts: ExerciseTexts
}
