import { routes, type AppRoute } from '../../../routing'
import type { SampleLink } from '../../../samples'

/** One "where next" link of the lesson panel. */
export interface RelatedLinkView {
  /** Unique in the list (`<kind>:<id>`). */
  key: string
  kind: SampleLink['kind']
  route: AppRoute
  title: string
}

/** Localized titles of link targets; undefined = the target does not exist (or is not available). */
export interface RelatedTitles {
  exercise(exerciseId: string): string | undefined
  design(briefId: string): string | undefined
  sample(sampleId: string): string | undefined
}

/** Turns a sample's `related` links into routes with titles; links to missing targets are dropped. */
export class RelatedLinks {
  static resolve(links: readonly SampleLink[], titles: RelatedTitles): RelatedLinkView[] {
    const views: RelatedLinkView[] = []
    for (const link of links) {
      const view = RelatedLinks.viewOf(link, titles)
      if (view && !views.some((existing) => existing.key === view.key)) views.push(view)
    }
    return views
  }

  private static viewOf(link: SampleLink, titles: RelatedTitles): RelatedLinkView | null {
    switch (link.kind) {
      case 'exercise': {
        const title = titles.exercise(link.exerciseId)
        return title === undefined ? null : { key: `exercise:${link.exerciseId}`, kind: link.kind, route: routes.exercise(link.exerciseId), title }
      }
      case 'design': {
        const title = titles.design(link.briefId)
        return title === undefined ? null : { key: `design:${link.briefId}`, kind: link.kind, route: routes.design(link.briefId), title }
      }
      case 'sample': {
        const title = titles.sample(link.sampleId)
        return title === undefined ? null : { key: `sample:${link.sampleId}`, kind: link.kind, route: routes.sample(link.sampleId), title }
      }
    }
  }
}
