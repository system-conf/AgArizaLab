// A tiny router over the History API: the current route, navigation and change notifications.
// The query string (`?lang=…`) is kept on every navigation; the hash is dropped unless asked.
import { AppRouteCodec, type AppRoute } from './AppRoute'

export interface UrlParts {
  pathname: string
  search: string
  hash: string
}

/** The part of the browser the router needs (window.history + location + popstate); fakeable in tests. */
export interface HistoryPort {
  location(): UrlParts
  push(url: string): void
  replace(url: string): void
  /** Calls `listener` on back / forward; returns the unsubscribe function. */
  onPopState(listener: () => void): () => void
}

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one (redirects). */
  replace?: boolean
  /** Keep the current `#…` (e.g. a `#lab=` share hash being forwarded to /lab). */
  keepHash?: boolean
}

export class AppRouter {
  private readonly history: HistoryPort
  private readonly listeners = new Set<() => void>()
  private cached: { pathname: string; route: AppRoute } | null = null

  constructor(history: HistoryPort) {
    this.history = history
    history.onPopState(() => this.notify())
  }

  /** Router over the real browser history. */
  static browser(): AppRouter {
    return new AppRouter({
      location: () => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }),
      push: (url) => window.history.pushState(null, '', url),
      replace: (url) => window.history.replaceState(window.history.state, '', url),
      onPopState: (listener) => {
        window.addEventListener('popstate', listener)
        return () => window.removeEventListener('popstate', listener)
      },
    })
  }

  /** Current route; the same object until the path changes (safe for useSyncExternalStore). */
  get route(): AppRoute {
    const { pathname } = this.history.location()
    if (this.cached?.pathname !== pathname) this.cached = { pathname, route: AppRouteCodec.parse(pathname) }
    return this.cached.route
  }

  /** Current query string (e.g. '?lang=tr'); links re-render when it changes. */
  get search(): string {
    return this.history.location().search
  }

  /** `href` for a link to `route` (keeps the query string). */
  href(route: AppRoute): string {
    return `${AppRouteCodec.format(route)}${this.history.location().search}`
  }

  navigate(route: AppRoute, options: NavigateOptions = {}): void {
    const current = this.history.location()
    const hash = options.keepHash === true ? current.hash : ''
    const url = `${AppRouteCodec.format(route)}${current.search}${hash}`
    if (url === `${current.pathname}${current.search}${current.hash}`) return
    if (options.replace === true) this.history.replace(url)
    else this.history.push(url)
    this.notify()
  }

  /** Updates a query parameter that is already in the URL (e.g. `lang` after a language switch). */
  updateQueryParameter(name: string, value: string): void {
    const current = this.history.location()
    const params = new URLSearchParams(current.search)
    if (!params.has(name) || params.get(name) === value) return
    params.set(name, value)
    this.history.replace(`${current.pathname}?${params.toString()}${current.hash}`)
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
