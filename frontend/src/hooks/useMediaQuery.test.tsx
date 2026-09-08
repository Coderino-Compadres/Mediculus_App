import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

/**
 * The one thing in the app that cannot be expressed in CSS: the trend chart's
 * labels live inside a scaled `viewBox`, so their rendered size is the declared
 * size times the container's scale factor and `calc()` cannot divide by it.
 *
 * jsdom has no `window.matchMedia`, so the *interesting* branch — the one that
 * subscribes and re-renders on a change — never runs in any other test in the
 * suite: every caller lands on its widest branch. Hence the stub below, and
 * hence the first test, which pins that a missing implementation reports "does
 * not match" rather than throwing.
 */

const QUERY = '(max-width: 480px)'

function Probe({ query = QUERY }: { query?: string }) {
  return <span data-testid="matches">{String(useMediaQuery(query))}</span>
}

/** A `matchMedia` whose result can be changed from the test. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const list = {
    matches,
    media: QUERY,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  }
  const matchMedia = vi.fn(() => list as unknown as MediaQueryList)
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true })

  return {
    matchMedia,
    listenerCount: () => listeners.size,
    change(next: boolean) {
      list.matches = next
      act(() => {
        listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent))
      })
    },
  }
}

afterEach(() => {
  // Back to jsdom's own state — no implementation at all — so no other test
  // inherits a stub.
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('without window.matchMedia', () => {
  it('reports "does not match" instead of throwing', () => {
    /** Which lands every caller on its widest branch — the behaviour the rest
     *  of the suite is written against. */
    Reflect.deleteProperty(window, 'matchMedia')

    render(<Probe />)

    expect(screen.getByTestId('matches')).toHaveTextContent('false')
  })
})

describe('with window.matchMedia', () => {
  it('reports the query\'s state on the first render', () => {
    /** Read in the initial state rather than in an effect: an effect would mean
     *  a second render on every mount, and there is no SSR here to need it. */
    stubMatchMedia(true)

    render(<Probe />)

    expect(screen.getByTestId('matches')).toHaveTextContent('true')
  })

  it('asks about the query it was given', () => {
    const media = stubMatchMedia(false)

    render(<Probe query="(min-width: 900px)" />)

    expect(media.matchMedia).toHaveBeenCalledWith('(min-width: 900px)')
  })

  it('re-renders when the viewport crosses the boundary', () => {
    const media = stubMatchMedia(false)

    render(<Probe />)
    media.change(true)

    expect(screen.getByTestId('matches')).toHaveTextContent('true')

    media.change(false)

    expect(screen.getByTestId('matches')).toHaveTextContent('false')
  })

  it('unsubscribes when the component goes away', () => {
    /** A chart that has been navigated away from must not keep a listener that
     *  sets state on the next rotation of the phone. */
    const media = stubMatchMedia(false)

    const { unmount } = render(<Probe />)
    expect(media.listenerCount()).toBe(1)

    unmount()

    expect(media.listenerCount()).toBe(0)
  })

  it('re-subscribes when the query itself changes', () => {
    const media = stubMatchMedia(false)

    const { rerender } = render(<Probe />)
    rerender(<Probe query="(min-width: 900px)" />)

    expect(media.matchMedia).toHaveBeenLastCalledWith('(min-width: 900px)')
    expect(media.listenerCount()).toBe(1)
  })
})
