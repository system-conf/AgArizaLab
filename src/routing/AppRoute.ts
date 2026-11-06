// The app's screens as path-based routes (History API). Cloudflare serves index.html for every
// path (SPA fallback), so a reload or a shared link opens the same screen again.

export type AppRoute =
  | { name: 'landing' }
  /** The workspace with the current (autosaved) lab; `#lab=…` opens a shared lab. */
  | { name: 'lab' }
  | { name: 'exercises' }
  | { name: 'exercise'; exerciseId: string }
  /** Solution report shown after a successful verification. */
  | { name: 'exerciseReport'; exerciseId: string }
  /** Any other path; the app sends the user to the landing page. */
  | { name: 'notFound'; path: string }

/** Exercise ids are camelCase identifiers (docs/PLAN.md §1). */
const EXERCISE_ID = /^[A-Za-z][A-Za-z0-9]*$/

/** Pure path ↔ route mapping. */
export class AppRouteCodec {
  /** Route of a URL path; trailing slashes and empty segments are ignored. */
  static parse(pathname: string): AppRoute {
    const segments = pathname.split('/').filter((segment) => segment !== '')
    const [first, second, third, ...rest] = segments
    if (first === undefined) return { name: 'landing' }
    if (first === 'lab' && second === undefined) return { name: 'lab' }
    if (first !== 'exercises' || rest.length > 0) return { name: 'notFound', path: pathname }
    if (second === undefined) return { name: 'exercises' }
    const exerciseId = AppRouteCodec.decode(second)
    if (exerciseId === null || !EXERCISE_ID.test(exerciseId)) return { name: 'notFound', path: pathname }
    if (third === undefined) return { name: 'exercise', exerciseId }
    return third === 'report' ? { name: 'exerciseReport', exerciseId } : { name: 'notFound', path: pathname }
  }

  /** URL path of a route (`notFound` keeps its path). */
  static format(route: AppRoute): string {
    switch (route.name) {
      case 'landing':
        return '/'
      case 'lab':
        return '/lab'
      case 'exercises':
        return '/exercises'
      case 'exercise':
        return `/exercises/${encodeURIComponent(route.exerciseId)}`
      case 'exerciseReport':
        return `/exercises/${encodeURIComponent(route.exerciseId)}/report`
      case 'notFound':
        return route.path
    }
  }

  static equals(first: AppRoute, second: AppRoute): boolean {
    return AppRouteCodec.format(first) === AppRouteCodec.format(second)
  }

  private static decode(segment: string): string | null {
    try {
      return decodeURIComponent(segment)
    } catch (error) {
      console.warn(`Malformed path segment '${segment}'`, error)
      return null
    }
  }
}

/** Route values for links and navigation (keeps route literals out of JSX). */
export const routes = {
  landing: { name: 'landing' },
  lab: { name: 'lab' },
  exercises: { name: 'exercises' },
  exercise: (exerciseId: string): AppRoute => ({ name: 'exercise', exerciseId }),
  exerciseReport: (exerciseId: string): AppRoute => ({ name: 'exerciseReport', exerciseId }),
} as const satisfies Record<string, AppRoute | ((exerciseId: string) => AppRoute)>
