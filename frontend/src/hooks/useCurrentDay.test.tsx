import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useCurrentDay } from './useCurrentDay'
import { toIsoDate } from '../utils/days'

/**
 * The live calendar day.
 *
 * This hook exists because of a specific defect: the diet panels compared the
 * day their data described with a `today` fixed at mount, from which that data
 * had itself been built — so the comparison was `x === x` and the day lock never
 * fired. The tests below are about the one property that fixes it: the value
 * changes when the clock crosses midnight, including in the case that fires no
 * browser event at all.
 */

function Probe() {
  return <span data-testid="day">{useCurrentDay()}</span>
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useCurrentDay', () => {
  it('starts on the current calendar day', () => {
    render(<Probe />)

    expect(screen.getByTestId('day')).toHaveTextContent(toIsoDate(new Date()))
  })

  it('notices midnight with nothing but a timer', async () => {
    /**
     * The case that matters most and is easiest to miss: a form left open on
     * screen while the day turns. It fires neither `visibilitychange` nor
     * `focus`, so a hook listening only for those would report Tuesday forever.
     */
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 23, 59))
    render(<Probe />)
    expect(screen.getByTestId('day')).toHaveTextContent('2026-09-09')

    vi.setSystemTime(new Date(2026, 8, 10, 0, 1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(screen.getByTestId('day')).toHaveTextContent('2026-09-10')
  })

  it('notices when the app comes back to the foreground', async () => {
    // A phone that spent the night in a pocket: the timer would get there too,
    // but not before the first thing the owner does in the morning.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 23, 30))
    render(<Probe />)

    vi.setSystemTime(new Date(2026, 8, 10, 7, 15))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByTestId('day')).toHaveTextContent('2026-09-10')
  })

  it('notices on focus as well', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 23, 30))
    render(<Probe />)

    vi.setSystemTime(new Date(2026, 8, 10, 7, 15))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(screen.getByTestId('day')).toHaveTextContent('2026-09-10')
  })

  it('stays put while the day does, however often it is asked', async () => {
    // React bails out of a re-render when the state is unchanged, so the
    // interval costs nothing on the ~1439 minutes a day that change nothing.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 10, 0))
    render(<Probe />)

    vi.setSystemTime(new Date(2026, 8, 9, 22, 0))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    expect(screen.getByTestId('day')).toHaveTextContent('2026-09-09')
  })

  it('stops listening once the screen is gone', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 23, 59))
    const { unmount } = render(<Probe />)
    const clearInterval = vi.spyOn(window, 'clearInterval')
    const removeListener = vi.spyOn(document, 'removeEventListener')

    unmount()

    expect(clearInterval).toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
