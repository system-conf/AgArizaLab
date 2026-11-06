// Path-based navigation (History API): `/`, `/lab`, `/exercises`, `/exercises/<id>`, `/exercises/<id>/report`,
// `/design`, `/design/<id>`, `/design/<id>/review`.
export { AppRouteCodec, routes, type AppRoute } from './AppRoute'
export { AppRouter, type HistoryPort, type NavigateOptions, type UrlParts } from './AppRouter'
export { AppRouterContext, useAppRoute, useAppRouter } from './useAppRouter'
export { RouteResolver, type RouteContext, type RouteDecision } from './RouteResolver'
export { ShareHashWatcher, type HashPort } from './ShareHashWatcher'
