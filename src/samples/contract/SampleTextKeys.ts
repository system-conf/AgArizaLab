import type { SampleCategoryId, SampleDefinition, SampleFeature, SampleLevel } from './SampleTypes'

type SampleKeySource = Pick<SampleDefinition, 'id' | 'steps' | 'breakIt'>

/**
 * Keys of the `samples` namespace (layout in docs/SAMPLE_LABS.md §Texts). Runtime-built keys: render
 * them with SampleTextReader or translateMessage, never with a cast around t().
 */
export class SampleTextKeys {
  static title(sampleId: string): string {
    return `samples:labs.${sampleId}.title`
  }

  static summary(sampleId: string): string {
    return `samples:labs.${sampleId}.summary`
  }

  static intro(sampleId: string, part: 'what' | 'why' | 'realWorld'): string {
    return `samples:labs.${sampleId}.intro.${part}`
  }

  static step(sampleId: string, stepId: string, part: 'title' | 'detail'): string {
    return `samples:labs.${sampleId}.steps.${stepId}.${part}`
  }

  static breakIt(sampleId: string, ideaId: string, part: 'change' | 'result'): string {
    return `samples:labs.${sampleId}.breakIt.${ideaId}.${part}`
  }

  /** A JSON string array (1+ items). */
  static topics(sampleId: string): string {
    return `samples:labs.${sampleId}.topics`
  }

  static categoryTitle(category: SampleCategoryId): string {
    return `samples:categories.${category}.title`
  }

  static categoryDescription(category: SampleCategoryId): string {
    return `samples:categories.${category}.description`
  }

  static level(level: SampleLevel): string {
    return `samples:levels.${level}`
  }

  static feature(feature: SampleFeature): string {
    return `samples:features.${feature}`
  }

  /** Every single-string key one sample needs (topics excluded: see `topics`). */
  static stringKeys(sample: SampleKeySource): string[] {
    const id = sample.id
    return [
      SampleTextKeys.title(id),
      SampleTextKeys.summary(id),
      SampleTextKeys.intro(id, 'what'),
      SampleTextKeys.intro(id, 'why'),
      SampleTextKeys.intro(id, 'realWorld'),
      ...sample.steps.flatMap((step) => [SampleTextKeys.step(id, step.id, 'title'), SampleTextKeys.step(id, step.id, 'detail')]),
      ...sample.breakIt.flatMap((ideaId) => [SampleTextKeys.breakIt(id, ideaId, 'change'), SampleTextKeys.breakIt(id, ideaId, 'result')]),
    ]
  }
}
