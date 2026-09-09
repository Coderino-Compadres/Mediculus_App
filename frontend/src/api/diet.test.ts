import { describe, expect, it } from 'vitest'
import { emptyActivityDay, emptySleepNight, localTime, newActivityEntry } from './diet'
import { toIsoDate } from '../utils/days'
import type { ActivityAnswers } from './diet'

/**
 * The diet module's data layer.
 *
 * `newActivityEntry` is the one thing here worth testing on its own, and the
 * reason is the defect it exists to prevent: the date used to be copied off the
 * day object the screen had loaded, whose own date was fixed when the route
 * mounted, so an activity saved at 00:10 was filed under the previous day. That
 * is invisible from a component test — a test can watch a button and a list, but
 * not which day a row went into — which is exactly why the stamp was extracted
 * to a function with an injectable clock.
 */

const ANSWERS: ActivityAnswers = {
  kind: 'Spacer',
  kindOther: '',
  durationMinutes: 35,
  feelingAfter: 'better',
}

describe('newActivityEntry', () => {
  it('stamps the day from the clock at the moment of saving', () => {
    // 00:10 on the 10th. Filed under the 10th, whatever day the screen was
    // opened on.
    const entry = newActivityEntry(ANSWERS, new Date(2026, 8, 10, 0, 10))

    expect(entry.date).toBe('2026-09-10')
    expect(entry.time).toBe('00:10')
  })

  it('does not inherit the day a screen was opened on', () => {
    /**
     * The regression, stated directly. A form opened at 23:55 on the 9th holds
     * a day whose `date` is '2026-09-09'; an entry saved from it fifteen minutes
     * later belongs to the 10th. Nothing about the entry may come from that
     * stale day object.
     */
    const openedOn = emptyActivityDay(new Date(2026, 8, 9, 23, 55))
    const entry = newActivityEntry(ANSWERS, new Date(2026, 8, 10, 0, 10))

    expect(openedOn.date).toBe('2026-09-09')
    expect(entry.date).not.toBe(openedOn.date)
  })

  it('reads the real clock when nobody passes one', () => {
    // Production never passes `now`; the argument is there for the tests above.
    expect(newActivityEntry(ANSWERS).date).toBe(toIsoDate(new Date()))
  })

  it('carries the answers through untouched', () => {
    const entry = newActivityEntry(ANSWERS, new Date(2026, 8, 10, 7, 5))

    expect(entry).toMatchObject(ANSWERS)
  })

  it('gives every entry its own id, marked as unpersisted', () => {
    const first = newActivityEntry(ANSWERS)
    const second = newActivityEntry(ANSWERS)

    expect(first.id).not.toBe(second.id)
    // The prefix says out loud that nothing here has reached a database.
    expect(first.id).toMatch(/^local-/)
  })
})

describe('localTime', () => {
  it('pads both halves, so a row never reads "7:5"', () => {
    expect(localTime(new Date(2026, 8, 10, 7, 5))).toBe('07:05')
  })
})

describe('the empty producers', () => {
  it('build today, in the reader\'s own calendar day', () => {
    expect(emptyActivityDay().date).toBe(toIsoDate(new Date()))
    expect(emptySleepNight().date).toBe(toIsoDate(new Date()))
  })

  it('answer with nothing rather than with the mockup\'s sample figures', () => {
    const day = emptyActivityDay()

    // A streak of 6 for somebody who has never written a meal is a lie with a
    // nicer number — the rule this whole file opens with.
    expect(day.entries).toEqual([])
    expect(day.steps).toBeNull()
  })

  it('start awakenings at zero, which is a real answer, and the rest at null', () => {
    const night = emptySleepNight()

    expect(night.awakenings).toBe(0)
    expect(night.fellAsleepAt).toBeNull()
    expect(night.wokeUpAt).toBeNull()
    expect(night.quality).toBeNull()
    expect(night.wakeFeeling).toBeNull()
  })
})
