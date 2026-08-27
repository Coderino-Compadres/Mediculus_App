import { useEffect, useRef, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { APP_NAME, ROUTE_TITLES } from '../routes'

/** The screen the URL names, or null for one that has no entry (the 404). */
function titleFor(pathname: string): string | null {
  for (const [pattern, title] of Object.entries(ROUTE_TITLES)) {
    if (matchPath(pattern, pathname)) return title
  }
  return null
}

/**
 * The three things a single-page app has to do by hand on every navigation.
 *
 * A real page load does all of them for free, which is why they are so easy to
 * miss:
 *
 * - **the title.** Every screen was "Mediculus", so browser tabs, history and
 *   the back button's tooltip were indistinguishable.
 * - **the scroll position.** React Router keeps it, so opening an entry from
 *   the bottom of a long list dropped the reader into the middle of the new
 *   screen.
 * - **the announcement.** Nothing moves focus and nothing is spoken, so a
 *   screen-reader user is left on a page that silently became a different one.
 *   Announced through a live region rather than by moving focus, which would
 *   fight the skip link and lose a sighted keyboard user's place.
 */
function RouteChange() {
  const { pathname } = useLocation()
  const [announcement, setAnnouncement] = useState('')
  // The first render is a page load: the browser has already scrolled to the
  // top and read the document out, so doing it again would be a duplicate.
  const firstRender = useRef(true)

  useEffect(() => {
    const title = titleFor(pathname)
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME

    if (firstRender.current) {
      firstRender.current = false
      return
    }

    window.scrollTo(0, 0)
    setAnnouncement(title ?? APP_NAME)
  }, [pathname])

  return (
    <div aria-live="polite" aria-atomic="true" className="visually-hidden">
      {announcement}
    </div>
  )
}

export default RouteChange
