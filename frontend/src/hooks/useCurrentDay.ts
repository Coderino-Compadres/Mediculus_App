import { useEffect, useState } from 'react'
import { toIsoDate } from '../utils/days'

/**
 * The calendar day it is *now*, re-read as the day goes on.
 *
 * WHY A HOOK RATHER THAN `toIsoDate(new Date())` AT THE TOP OF A SCREEN. Every
 * screen in this app fixes "today" once, at mount (`useMemo(() => new Date(),
 * [])`), which is right for a date it prints and wrong for a rule it enforces.
 * The diet module's activity and sleep panels got that wrong in exactly the way
 * a frozen value invites: they compared the day their data described with the
 * same frozen `today` the data had been built from, so the comparison was
 * `x === x` and the day lock could never fire. A phone open at 23:55 was still
 * offering to write into Tuesday at 00:10 on Wednesday.
 *
 * WHAT MAKES IT LIVE. Three triggers, because the interesting case is not the
 * one you would guess. `visibilitychange` and `focus` cover a phone that spent
 * the night in a pocket — but they do *not* cover the common case, a form left
 * on screen while the clock passes midnight, which fires neither. So there is
 * also a minute's interval. One timer per mounted screen is a fair price for a
 * rule that is otherwise decorative.
 *
 * A minute's granularity is deliberate: the lock decides which *day* an entry
 * belongs to, and being up to a minute late in noticing a boundary that arrives
 * once a day is not worth a second's polling. What must never be a minute late
 * is the date written onto an entry, and that is not this hook's job — it is
 * taken from the clock at the moment of saving (see `newActivityEntry`).
 */
const RECHECK_MS = 60_000

export function useCurrentDay(): string {
  const [day, setDay] = useState(() => toIsoDate(new Date()))

  useEffect(() => {
    // React bails out of a re-render when the state is unchanged, so this is a
    // no-op on all but the one tick a day that actually crosses midnight.
    function recheck() {
      setDay(toIsoDate(new Date()))
    }

    const timer = window.setInterval(recheck, RECHECK_MS)
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [])

  return day
}
