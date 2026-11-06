import {
  SAMPLE_LEVELS,
  SampleCatalog,
  type SampleCategoryId,
  type SampleCompletion,
  type SampleFeature,
  type SampleLevel,
  type SampleProgressBook,
} from '../../../samples'

/** Localized texts the list needs (SampleTextReader + the `samples` namespace in the screen). */
export interface SampleListTexts {
  title(sampleId: string): string
  summary(sampleId: string): string
  topics(sampleId: string): string[]
  categoryTitle(category: SampleCategoryId): string
  level(level: SampleLevel): string
  feature(feature: SampleFeature): string
}

/** One sample card. */
export interface SampleListItem {
  id: string
  category: SampleCategoryId
  level: SampleLevel
  features: readonly SampleFeature[]
  title: string
  summary: string
  topics: string[]
  completion: SampleCompletion
  /** Localized texts the search looks in. */
  searchFields: string[]
}

export interface SampleListGroup {
  category: SampleCategoryId
  items: SampleListItem[]
}

/** Chips and search text of the list; an empty chip list means "any". */
export interface SampleListFilter {
  query: string
  levels: readonly SampleLevel[]
  features: readonly SampleFeature[]
}

export const EMPTY_SAMPLE_FILTER: SampleListFilter = { query: '', levels: [], features: [] }

/**
 * The `/samples` list: available samples grouped by category (SampleCatalog order) with their
 * localized texts and progress; filtered by search text, level chips and required-feature chips.
 */
export class SampleListModel {
  readonly groups: readonly SampleListGroup[]

  constructor(groups: readonly SampleListGroup[]) {
    this.groups = groups
  }

  static from(catalog: SampleCatalog, texts: SampleListTexts, book: SampleProgressBook): SampleListModel {
    return new SampleListModel(
      catalog.byCategory().map((group) => ({
        category: group.category.id,
        items: group.samples.map((sample): SampleListItem => {
          const title = texts.title(sample.id)
          const summary = texts.summary(sample.id)
          const topics = texts.topics(sample.id)
          return {
            id: sample.id,
            category: sample.category,
            level: sample.level,
            features: sample.features,
            title,
            summary,
            topics,
            completion: book.completion(sample),
            searchFields: [
              title,
              summary,
              ...topics,
              texts.categoryTitle(sample.category),
              texts.level(sample.level),
              ...sample.features.map((feature) => texts.feature(feature)),
            ],
          }
        }),
      })),
    )
  }

  get items(): SampleListItem[] {
    return this.groups.flatMap((group) => group.items)
  }

  /** Levels some sample has, in SAMPLE_LEVELS order (the level chips). */
  levels(): SampleLevel[] {
    const used = new Set(this.items.map((item) => item.level))
    return SAMPLE_LEVELS.filter((level) => used.has(level))
  }

  /** Features some sample needs, in first-use order (the feature chips). */
  features(): SampleFeature[] {
    return [...new Set(this.items.flatMap((item) => item.features))]
  }

  /** Samples whose every step is done, and all samples. */
  completion(): { complete: number; total: number } {
    const items = this.items
    return { complete: items.filter((item) => item.completion.complete).length, total: items.length }
  }

  /** Groups with the matching items only (empty groups dropped). */
  filtered(filter: SampleListFilter, language: string): SampleListGroup[] {
    return this.groups
      .map((group) => ({ category: group.category, items: group.items.filter((item) => SampleListModel.matches(item, filter, language)) }))
      .filter((group) => group.items.length > 0)
  }

  /** A level chip matches its level, feature chips match samples needing any of them, and the search text matches. */
  static matches(item: SampleListItem, filter: SampleListFilter, language: string): boolean {
    if (filter.levels.length > 0 && !filter.levels.includes(item.level)) return false
    if (filter.features.length > 0 && !filter.features.some((feature) => item.features.includes(feature))) return false
    return SampleCatalog.matches(item.searchFields, filter.query, language)
  }

  static isFiltered(filter: SampleListFilter): boolean {
    return filter.query.trim() !== '' || filter.levels.length > 0 || filter.features.length > 0
  }

  /** Adds the value when absent, removes it when present (chip toggle). */
  static toggle<T>(values: readonly T[], value: T): T[] {
    return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value]
  }
}
