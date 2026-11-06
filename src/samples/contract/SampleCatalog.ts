import type { LabDocument } from '../../domain'
import { createLabFromState, type CreateLabOptions } from '../../lab/createLab'
import { SAMPLE_CATEGORIES, SAMPLE_FEATURE_AVAILABILITY, type SampleCategory } from './sampleCatalogue'
import type { SampleDefinition, SampleFeature } from './SampleTypes'

export interface SampleCategoryGroup {
  category: SampleCategory
  /** Ordered by `order`. */
  samples: SampleDefinition[]
}

/**
 * A free, unlocked lab from a sample (fresh objects every call). `title` is user content once opened:
 * pass the localized sample title (`SampleTextReader.title`).
 */
export function openSampleLab(sample: Pick<SampleDefinition, 'lab'>, options: CreateLabOptions = {}): LabDocument {
  const lab = sample.lab()
  return { ...createLabFromState(lab.state, lab.layout, options), annotations: lab.annotations ?? [] }
}

/** Lower-cased, accent-insensitive text for search (Turkish İ / ı handled by the locale). */
function normalize(text: string, language: string): string {
  return text
    .toLocaleLowerCase(language)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
}

/** The sample list of the Samples screen: available samples, grouped by category, searchable. */
export class SampleCatalog {
  private readonly samples: readonly SampleDefinition[]
  private readonly availability: Readonly<Record<SampleFeature, boolean>>

  constructor(samples: readonly SampleDefinition[], availability: Readonly<Record<SampleFeature, boolean>> = SAMPLE_FEATURE_AVAILABILITY) {
    this.samples = samples
    this.availability = availability
  }

  /** Every feature of the sample is available in this build. */
  isAvailable(sample: Pick<SampleDefinition, 'features'>): boolean {
    return sample.features.every((feature) => this.availability[feature])
  }

  /** An available sample by id (undefined: unknown or not available yet → the route shows the list). */
  find(sampleId: string): SampleDefinition | undefined {
    return this.samples.find((sample) => sample.id === sampleId && this.isAvailable(sample))
  }

  /** Available samples in display order (category order, then `order`). */
  available(): SampleDefinition[] {
    return this.byCategory().flatMap((group) => group.samples)
  }

  /** Categories that have at least one available sample, in display order. */
  byCategory(): SampleCategoryGroup[] {
    return SAMPLE_CATEGORIES.map((category) => ({
      category,
      samples: this.samples
        .filter((sample) => sample.category === category.id && this.isAvailable(sample))
        .sort((a, b) => a.order - b.order),
    })).filter((group) => group.samples.length > 0)
  }

  /**
   * True when every word of `query` occurs in one of `fields` (localized title, summary, topics,
   * category and level names). Case and accent insensitive; an empty query matches everything.
   */
  static matches(fields: readonly string[], query: string, language: string): boolean {
    const words = normalize(query, language).split(/\s+/).filter((word) => word !== '')
    const haystack = fields.map((field) => normalize(field, language))
    return words.every((word) => haystack.some((field) => field.includes(word)))
  }
}
