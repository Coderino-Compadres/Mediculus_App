import { useEffect, useState } from 'react'

/**
 * Whether a CSS media query currently matches.
 *
 * A media query, not a measurement: nothing here reads an element's size, so it
 * stays on the same side of the line as the rest of the app — no
 * `ResizeObserver`, no `getBoundingClientRect`. It exists for the one thing in
 * the app that genuinely cannot be expressed in CSS: the trend chart's labels
 * live inside a scaled `viewBox`, so their *rendered* size is the declared size
 * multiplied by the container's scale factor, and `calc()` cannot divide by that
 * factor. See `components/TrendChart.tsx`.
 *
 * `window.matchMedia` does not exist in jsdom, so a missing implementation
 * reports "does not match" instead of throwing — which lands every caller on its
 * widest branch, i.e. the behaviour the tests were written against.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    // Only the listener, deliberately: re-reading `list.matches` here would be
    // a setState inside an effect, i.e. a second render on every mount, and it
    // would guard against nothing. There is no SSR in this app, so the initial
    // state above is read in the same tick as this effect.
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
