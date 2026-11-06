import type { AppRoute } from './AppRoute'

export interface RouteContext {
  /** Ids of the exercises that exist. */
  exerciseIds: readonly string[]
  /** Exercise whose solution report is in memory (just verified), or null. */
  reportExerciseId: string | null
  /** The URL carries a `#lab=…` share hash (it belongs to the workspace). */
  hasShareHash: boolean
}

export type RouteDecision = { kind: 'render' } | { kind: 'redirect'; to: AppRoute; keepHash: boolean }

const RENDER: RouteDecision = { kind: 'render' }

/**
 * Redirects of the app (always as history replacements): unknown paths → landing; a share hash
 * outside the workspace → `/lab` with the hash; unknown exercise → list; a report without a
 * verified attempt (reload, typed URL) → the exercise.
 */
export class RouteResolver {
  static resolve(route: AppRoute, context: RouteContext): RouteDecision {
    if (context.hasShareHash && route.name !== 'lab') return { kind: 'redirect', to: { name: 'lab' }, keepHash: true }
    switch (route.name) {
      case 'landing':
      case 'lab':
      case 'exercises':
        return RENDER
      case 'notFound':
        return { kind: 'redirect', to: { name: 'landing' }, keepHash: false }
      case 'exercise':
      case 'exerciseReport':
        if (!context.exerciseIds.includes(route.exerciseId)) return { kind: 'redirect', to: { name: 'exercises' }, keepHash: false }
        if (route.name === 'exerciseReport' && context.reportExerciseId !== route.exerciseId) {
          return { kind: 'redirect', to: { name: 'exercise', exerciseId: route.exerciseId }, keepHash: false }
        }
        return RENDER
    }
  }
}
