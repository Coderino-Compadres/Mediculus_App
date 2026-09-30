import { useEffect, useState } from 'react'

/**
 * How long a search box waits after the last keystroke before it filters.
 *
 * One constant for every search in the app, so they all feel the same; a new
 * search box should use this rather than a number of its own.
 */
export const SEARCH_DEBOUNCE_MS = 500

/**
 * `value`, but only once it has stopped changing for `delayMs`.
 *
 * The input itself stays bound to the live value — what the person types
 * appears at once — and only what is computed from it (the filtered list, a
 * request) waits. Each change restarts the timer, so typing "kowalska" filters
 * once, after the last letter, instead of eight times.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
