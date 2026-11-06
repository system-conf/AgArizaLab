import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { useAppRouter, type AppRoute } from '../../routing'

interface AppLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: AppRoute
}

/**
 * A real link (`<a href>`, so open-in-new-tab and screen readers work) that navigates inside the
 * app without a reload on a plain left click.
 */
function AppLink({ to, onClick, ...rest }: AppLinkProps) {
  const router = useAppRouter()
  // Re-render when the query string changes (`?lang=` after a language switch).
  useSyncExternalStore(
    (onChange) => router.subscribe(onChange),
    () => router.search,
  )

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    router.navigate(to)
  }

  return <a {...rest} href={router.href(to)} onClick={handleClick} />
}

export default AppLink
