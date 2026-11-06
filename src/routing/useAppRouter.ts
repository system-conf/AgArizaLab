// React access to the app router: provide one AppRouter at the top, read the route anywhere.
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AppRoute } from './AppRoute'
import type { AppRouter } from './AppRouter'

export const AppRouterContext = createContext<AppRouter | null>(null)

export function useAppRouter(): AppRouter {
  const router = useContext(AppRouterContext)
  if (router === null) throw new Error('useAppRouter needs an AppRouterContext provider')
  return router
}

/** Current route; re-renders on navigation and on back / forward. */
export function useAppRoute(): AppRoute {
  const router = useAppRouter()
  return useSyncExternalStore(
    (onChange) => router.subscribe(onChange),
    () => router.route,
  )
}
