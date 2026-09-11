import { describe, expect, it } from 'vitest'
import { READ_ONLY_BADGE, dayLockNotice, isEditableDay } from './dayLock'
import { toIsoDate } from './days'

/**
 * The app's rule about its own past, and the one promise attached to it.
 *
 * `isEditableDay` is a calendar-day comparison rather than an instant, and the
 * trap it was written against is passing it a `now` that came from the same
 * frozen clock as the date under test — the check then asks `x === x` and
 * enforces nothing. That belongs to the callers (see `hooks/useCurrentDay.ts`);
 * what is pinned here is the comparison itself and the wording.
 */

describe('isEditableDay', () => {
  it('is true only for the reader\'s own calendar day', () => {
    const now = new Date(2026, 8, 10, 23, 55)

    expect(isEditableDay('2026-09-10', now)).toBe(true)
    expect(isEditableDay('2026-09-09', now)).toBe(false)
    expect(isEditableDay('2026-09-11', now)).toBe(false)
  })

  it('turns over at local midnight, not at a UTC instant', () => {
    // 00:10 local is already the next day, which is the case a UTC comparison
    // files into yesterday for anybody east of Greenwich.
    expect(isEditableDay('2026-09-10', new Date(2026, 8, 11, 0, 10))).toBe(false)
    expect(isEditableDay('2026-09-11', new Date(2026, 8, 11, 0, 10))).toBe(true)
  })

  it('reads the real clock when nobody passes one', () => {
    expect(isEditableDay(toIsoDate(new Date()))).toBe(true)
  })
})

describe('dayLockNotice', () => {
  it('states the deadline and, by default, that the entry is then kept', () => {
    const notice = dayLockNotice('piątek, 14 sierpnia')

    expect(notice).toContain('do końca dzisiejszego dnia (piątek, 14 sierpnia)')
    expect(notice).toContain('zapisany na stałe')
  })

  it('drops the promise for a screen that stores nothing', () => {
    /**
     * The deadline is a rule and holds either way; "zostanie zapisany na stałe"
     * is a claim that the entry survives, which on /diet/activity-sleep is
     * false — nothing there reaches an endpoint. Rendered anyway, it sat one
     * line under the note admitting exactly that.
     */
    const notice = dayLockNotice('czwartek, 10 września', false)

    expect(notice).toContain('do końca dzisiejszego dnia (czwartek, 10 września)')
    expect(notice).not.toContain('na stałe')
  })
})

describe('the badge', () => {
  it('is the psychotherapy module\'s own word, so one rule has one name', () => {
    // pages/Journals.tsx says this about a past diary entry; a patient crossing
    // between the modules must not meet two explanations of one rule.
    expect(READ_ONLY_BADGE).toBe('Tylko odczyt')
  })
})
