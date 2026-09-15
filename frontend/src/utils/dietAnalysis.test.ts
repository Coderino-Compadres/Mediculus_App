import { describe, expect, it } from 'vitest'
import {
  DIET_ANALYSIS_WINDOW_DAYS,
  DIET_HEATMAP_MIN_DAYS,
  DIET_HEATMAP_MIN_WEEKDAY_DAYS,
  DIET_SLOT_STARTS,
  buildDietAnalysis,
  mealDensityColor,
  mealSlot,
  mealsGenitive,
} from './dietAnalysis'
import { addDays, fromIsoDate, toIsoDate } from './days'
import { weekdayIndex } from './analysis'
import type { DietJournalDay } from '../types/diet'
import type { DietAnalysis } from '../types/dietAnalysis'

/**
 * The arithmetic behind the diet module's "Analiza".
 *
 * Everything here runs against a fixed calendar — `buildDietAnalysis` takes
 * "today" as an argument precisely so it can — and **2026-09-14 is a Monday**,
 * chosen for that: against a fixture anchored on a Sunday half the weekday
 * assertions below would pass by accident.
 */

/** Monday. Every date in this file is counted back from it. */
const TODAY = new Date(2026, 8, 14)

function isoDaysAgo(days: number): string {
  return toIsoDate(addDays(TODAY, -days))
}

/** One day of the history, as `fetchDietHistory` hands it over: the hours are
 *  the only thing any test here cares about. */
function day(date: string, times: (string | null)[]): DietJournalDay {
  return {
    date,
    meals: times.map((time, index) => ({
      id: `${date}-${index}`,
      kind: null,
      time,
      description: 'kanapka',
    })),
  }
}

/** `count` consecutive days ending today, each holding the same hours. */
function consecutive(count: number, times: (string | null)[]): DietJournalDay[] {
  return Array.from({ length: count }, (_, offset) => day(isoDaysAgo(offset), times))
}

/** Never null in these fixtures, and narrowing it here keeps every assertion
 *  below from repeating the check. */
function analyse(history: DietJournalDay[], today: Date = TODAY): DietAnalysis {
  const analysis = buildDietAnalysis(history, today)
  if (analysis === null) throw new Error('expected an analysis')
  return analysis
}

function cell(analysis: DietAnalysis, weekday: number, slot: string) {
  const found = analysis.heatmap.cells.find((c) => c.weekday === weekday && c.slot === slot)
  if (found === undefined) throw new Error(`no cell ${weekday}:${slot}`)
  return found
}

function bar(analysis: DietAnalysis, slot: string): number {
  const found = analysis.slots.find((share) => share.slot === slot)
  if (found === undefined) throw new Error(`no bar ${slot}`)
  return found.days
}

describe('which part of the day a meal falls in', () => {
  /**
   * A transcription of `meal_slot` in backend/core/diet_reports.py, and the
   * cases below are the ones that separate it from the obvious implementation:
   * the night wraps midnight, and each boundary belongs to the slot it opens.
   */
  it('puts a late supper and an early-hours meal in the same night', () => {
    // The mockup's own bands stop at 22:00 and restart at 06:00, which would
    // drop both of these. Night eating is what a psychodietitian reads this
    // grid for, so the buckets meet end to end instead.
    expect(mealSlot('23:40')).toBe('night')
    expect(mealSlot('04:50')).toBe('night')
    expect(mealSlot('00:00')).toBe('night')
  })

  it('opens each slot on its own boundary', () => {
    expect(mealSlot('05:00')).toBe('morning')
    expect(mealSlot('11:00')).toBe('noon')
    expect(mealSlot('17:00')).toBe('evening')
    expect(mealSlot('22:00')).toBe('night')
  })

  it('closes each slot one minute before the next', () => {
    expect(mealSlot('10:59')).toBe('morning')
    expect(mealSlot('16:59')).toBe('noon')
    expect(mealSlot('21:59')).toBe('evening')
  })

  it('sends a meal with no hour, or an unreadable one, to its own column', () => {
    /** §05: no field blocks a save, so an hourless meal is an ordinary entry
     *  rather than an error — and guessing an hour for it would invent an
     *  answer nobody gave. `datetime.time.fromisoformat` raises on the other
     *  three, which lands them in the same place on the server. */
    expect(mealSlot(null)).toBe('unspecified')
    expect(mealSlot('')).toBe('unspecified')
    expect(mealSlot('po południu')).toBe('unspecified')
    expect(mealSlot('25:00')).toBe('unspecified')
    expect(mealSlot('12:73')).toBe('unspecified')
  })

  it('accepts the seconds a serializer may add', () => {
    expect(mealSlot('17:00:00')).toBe('evening')
  })

  it('cuts the day where core/diet_reports.py cuts it', () => {
    /** The one assertion in this file that is about the *other* language. Until
     *  the cross-language test TODO in dietAnalysis.ts exists, this is what
     *  stands between the two copies of these four numbers. */
    expect(DIET_SLOT_STARTS.map((boundary) => [boundary.minutes, boundary.slot])).toEqual([
      [5 * 60, 'morning'],
      [11 * 60, 'noon'],
      [17 * 60, 'evening'],
      [22 * 60, 'night'],
    ])
  })
})

describe('the window', () => {
  it('is as long as the account when the account is younger than the ceiling', () => {
    // Six days in, an analysis "of the last 30 days" would be describing a
    // period three quarters of which does not exist yet.
    const analysis = analyse(consecutive(6, ['08:00']))

    expect(analysis.window.days).toBe(6)
    expect(analysis.window.startDate).toBe(isoDaysAgo(5))
    expect(analysis.window.endDate).toBe(toIsoDate(TODAY))
  })

  it('stops growing at the ceiling', () => {
    const analysis = analyse(consecutive(90, ['08:00']))

    expect(analysis.window.days).toBe(DIET_ANALYSIS_WINDOW_DAYS)
    expect(analysis.window.daysWithMeal).toBe(DIET_ANALYSIS_WINDOW_DAYS)
  })

  it('counts meals, not days, in the figure the caption prints', () => {
    const analysis = analyse(consecutive(10, ['08:00', '13:00']))

    expect(analysis.window.daysWithMeal).toBe(10)
    expect(analysis.window.mealCount).toBe(20)
  })

  it('is null only for somebody who has never saved a meal', () => {
    expect(buildDietAnalysis([], TODAY)).toBeNull()
    // A day the server would never send, but the shape allows: it must not
    // anchor a window to a date holding nothing.
    expect(buildDietAnalysis([day(isoDaysAgo(3), [])], TODAY)).toBeNull()
  })

  it('answers with an empty window rather than null when the history is all older', () => {
    /** "Nothing in the last thirty days" and "nothing ever" are different things
     *  to say, and the screen says them differently. */
    const analysis = analyse([day(isoDaysAgo(60), ['08:00'])])

    expect(analysis.window.daysWithMeal).toBe(0)
    expect(analysis.window.mealCount).toBe(0)
    expect(analysis.heatmap.unlocked).toBe(false)
  })

  it('ignores a day dated in the future', () => {
    const tomorrow = toIsoDate(addDays(TODAY, 1))
    const analysis = analyse([...consecutive(5, ['08:00']), day(tomorrow, ['08:00'])])

    expect(analysis.window.days).toBe(5)
    expect(analysis.window.mealCount).toBe(5)
  })

  it('merges two rows that claim the same day', () => {
    /** `core/meals.load_history` groups by `entry_date` before sending, so this
     *  should not arrive — but nothing in the shape enforces it, and counting
     *  one day twice towards a square is not harmless. */
    const date = isoDaysAgo(0)
    const analysis = analyse([day(date, ['08:00']), day(date, ['19:00'])])

    expect(analysis.window.daysWithMeal).toBe(1)
    expect(analysis.window.mealCount).toBe(2)
    expect(bar(analysis, 'morning')).toBe(1)
    expect(bar(analysis, 'evening')).toBe(1)
  })
})

describe('the bars', () => {
  it('counts days and never meals', () => {
    // Three breakfasts on one Tuesday are one Tuesday morning. The unit is the
    // same one the rankings in both modules' reports use.
    const analysis = analyse(consecutive(4, ['06:30', '08:00', '09:15']))

    expect(bar(analysis, 'morning')).toBe(4)
    expect(analysis.window.mealCount).toBe(12)
  })

  it('always offers the four parts of the day, so a zero is a measurement', () => {
    const analysis = analyse(consecutive(5, ['08:00']))

    expect(analysis.slots.map((share) => share.slot)).toEqual([
      'morning', 'noon', 'evening', 'night',
    ])
    expect(bar(analysis, 'noon')).toBe(0)
  })

  it('leaves an hourless meal off the bars and counts it separately', () => {
    const analysis = analyse([
      ...consecutive(3, ['08:00']),
      day(isoDaysAgo(4), [null, null]),
    ])

    expect(analysis.untimedMeals).toBe(2)
    expect(analysis.slots.reduce((total, share) => total + share.days, 0)).toBe(3)
    // It is still a day the patient wrote on, and still a meal in the caption.
    expect(analysis.window.daysWithMeal).toBe(4)
    expect(analysis.window.mealCount).toBe(5)
  })
})

describe('the grid', () => {
  it('stays locked until enough days carry a meal with an hour', () => {
    const analysis = analyse(consecutive(DIET_HEATMAP_MIN_DAYS - 1, ['08:00']))

    expect(analysis.heatmap.timedDays).toBe(DIET_HEATMAP_MIN_DAYS - 1)
    expect(analysis.heatmap.unlocked).toBe(false)
  })

  it('does not unlock on the plain day count', () => {
    /** Thirty days of meals of which three carry an hour would otherwise unlock
     *  a grid drawn from three points. */
    const analysis = analyse([
      ...consecutive(3, ['08:00']),
      ...Array.from({ length: 20 }, (_, index) => day(isoDaysAgo(index + 3), [null])),
    ])

    expect(analysis.window.daysWithMeal).toBe(23)
    expect(analysis.heatmap.timedDays).toBe(3)
    expect(analysis.heatmap.unlocked).toBe(false)
  })

  it('unlocks once there is enough behind it', () => {
    const analysis = analyse(consecutive(DIET_HEATMAP_MIN_DAYS, ['08:00']))

    expect(analysis.heatmap.unlocked).toBe(true)
    expect(analysis.heatmap.cells).toHaveLength(7 * 4)
  })

  it('tells "we have never heard from you then" apart from "nothing happened then"', () => {
    /**
     * THE DISTINCTION THE WHOLE GRID RESTS ON. Three weeks of breakfasts with
     * every Sunday missing: Sunday is absent from the record, so its four
     * squares are null and draw as outlines, while Monday *is* in the record and
     * simply holds no evening meal, which is a measured zero.
     *
     * Collapsing the two would let "nie wiemy nic o Twoich niedzielach" render
     * exactly like "w niedziele nic nie jesz" — a claim about somebody's eating
     * drawn from their not writing.
     */
    const history = Array.from({ length: 21 }, (_, offset) => isoDaysAgo(offset))
      .filter((iso) => fromIsoDate(iso).getDay() !== 0)
      .map((iso) => day(iso, ['08:00']))

    const analysis = analyse(history)
    const sunday = weekdayIndex(fromIsoDate(isoDaysAgo(1))) // 2026-09-13 is a Sunday
    const monday = weekdayIndex(fromIsoDate(isoDaysAgo(0)))

    expect(analysis.heatmap.unlocked).toBe(true)

    expect(cell(analysis, sunday, 'morning').observedDays).toBe(0)
    expect(cell(analysis, sunday, 'morning').days).toBeNull()

    expect(cell(analysis, monday, 'morning').days).toBe(3)
    expect(cell(analysis, monday, 'evening').observedDays).toBe(3)
    expect(cell(analysis, monday, 'evening').days).toBe(0)
  })

  it('does not let a day of hourless meals vouch for its weekday', () => {
    // Otherwise a Sunday holding one meal with no hour would turn that whole
    // column from "nothing known" into a row of measured zeroes.
    const analysis = analyse([
      ...consecutive(DIET_HEATMAP_MIN_DAYS, ['08:00']).filter(
        (entry) => fromIsoDate(entry.date).getDay() !== 0,
      ),
      ...Array.from({ length: 21 }, (_, offset) => isoDaysAgo(offset))
        .filter((iso) => fromIsoDate(iso).getDay() === 0)
        .map((iso) => day(iso, [null])),
    ])

    const sunday = weekdayIndex(fromIsoDate(isoDaysAgo(1)))

    expect(cell(analysis, sunday, 'morning').observedDays).toBe(0)
    expect(cell(analysis, sunday, 'morning').days).toBeNull()
  })

  it('gives every square the denominator it has to be read against', () => {
    /** There is no grid-wide maximum any more and nothing should reintroduce
     *  one: a square is shaded against its own weekday's `observedDays`. In a
     *  21-day window every weekday occurs three times, which is the case that
     *  used to hide the bug. */
    const analysis = analyse(consecutive(21, ['08:00']))

    for (const cell of analysis.heatmap.cells) {
      expect(cell.observedDays).toBe(3)
    }
  })
})

/**
 * THE ARITHMETIC THAT MAKES ONE COLUMN COMPARABLE WITH THE NEXT.
 *
 * Thirty days do not divide by seven: two weekdays fall five times inside a full
 * window and five fall four times. A shade taken from the fullest square on the
 * grid reads that back to the patient as a habit — and because the window rolls,
 * the two dark columns move forward by one every day while nothing about her
 * eating changes. Everything below is that defect, pinned from both directions.
 */
describe('the shade of a square', () => {
  /** What `pages/DietAnalysis.tsx` does, kept here so the rule can be tested
   *  without mounting a screen. Mirrors `squareColor` exactly. */
  function shade(analysis: DietAnalysis, weekday: number, slot: string): string | null {
    const found = cell(analysis, weekday, slot)
    if (found.days === null || found.observedDays < DIET_HEATMAP_MIN_WEEKDAY_DAYS) return null
    return mealDensityColor(found.days / found.observedDays)
  }

  it('is one colour across the whole row when she eats the same every weekday, at 30 days', () => {
    // Forty days of history, so the window sits at its ceiling of thirty — the
    // length that does not divide by seven.
    const analysis = analyse(consecutive(40, ['08:00', '13:00', '19:00', '23:00']))
    expect(analysis.window.days).toBe(DIET_ANALYSIS_WINDOW_DAYS)

    // Two weekdays are observed five times and five are observed four, which is
    // the artefact itself — and it must not reach the colour.
    const observed = new Set(analysis.heatmap.cells.map((c) => c.observedDays))
    expect([...observed].sort()).toEqual([4, 5])

    for (const slot of ['morning', 'noon', 'evening', 'night']) {
      const row = Array.from({ length: 7 }, (_, weekday) => shade(analysis, weekday, slot))
      expect(new Set(row).size, slot).toBe(1)
    }
  })

  it('is one colour across the whole row on a window clipped to the account age', () => {
    // Sixteen days in: Monday and Sunday occur three times, the rest twice. The
    // clipped window is the common case, and it does not divide by seven either.
    const analysis = analyse(consecutive(16, ['08:00', '19:00']))
    expect(analysis.window.days).toBe(16)
    expect(new Set(analysis.heatmap.cells.map((c) => c.observedDays))).toEqual(new Set([2, 3]))

    for (const slot of ['morning', 'evening']) {
      const row = Array.from({ length: 7 }, (_, weekday) => shade(analysis, weekday, slot))
      expect(new Set(row).size, slot).toBe(1)
    }
  })

  it('draws four of five paler than four of four', () => {
    /** The defect running the other way: the raw count made a breakfast on four
     *  of five Mondays and on four of four Tuesdays draw the same colour, which
     *  erased a difference the patient actually has. */
    const history: DietJournalDay[] = []
    for (let offset = 0; offset < 30; offset += 1) {
      const date = addDays(TODAY, -offset)
      const weekday = weekdayIndex(date)
      // Breakfast every day except the oldest Monday, which holds only a supper
      // — so that Monday is still an observed day and still counts towards five.
      history.push(day(toIsoDate(date), weekday === 0 && offset >= 28 ? ['19:00'] : ['08:00']))
    }

    const analysis = analyse(history)
    const monday = cell(analysis, 0, 'morning')
    const tuesday = cell(analysis, 1, 'morning')

    expect([monday.days, monday.observedDays]).toEqual([4, 5])
    expect([tuesday.days, tuesday.observedDays]).toEqual([4, 4])
    expect(shade(analysis, 0, 'morning')).not.toBe(shade(analysis, 1, 'morning'))
    expect(shade(analysis, 1, 'morning')).toBe(mealDensityColor(1))
  })

  it('withholds the colour from a weekday observed too few times', () => {
    /** Without a per-column threshold, one observed Saturday would put the whole
     *  Saturday column at full depth off a single day of evidence — the mistake
     *  DIET_HEATMAP_MIN_DAYS guards the map against, one level down. */
    const history = Array.from({ length: 21 }, (_, offset) => isoDaysAgo(offset))
      // Every day except Saturday, plus exactly one Saturday.
      .filter((iso) => fromIsoDate(iso).getDay() !== 6)
      .map((iso) => day(iso, ['08:00']))
    const oneSaturday = Array.from({ length: 21 }, (_, offset) => isoDaysAgo(offset))
      .filter((iso) => fromIsoDate(iso).getDay() === 6)
      .slice(0, 1)
      .map((iso) => day(iso, ['08:00']))

    const analysis = analyse([...history, ...oneSaturday])
    const saturday = weekdayIndex(fromIsoDate(oneSaturday[0].date))

    expect(analysis.heatmap.unlocked).toBe(true)
    expect(cell(analysis, saturday, 'morning').observedDays).toBe(1)
    // A real count, so it is not "brak wpisu" — and still no colour.
    expect(cell(analysis, saturday, 'morning').days).toBe(1)
    expect(shade(analysis, saturday, 'morning')).toBeNull()

    // The weekdays that were observed enough still get theirs.
    expect(shade(analysis, 0, 'morning')).not.toBeNull()
  })

  it('keeps the threshold at the value DIET_HEATMAP_MIN_DAYS was chosen for', () => {
    /** Two, not three. A 14-day window written daily gives every weekday exactly
     *  two observations, so a threshold of three would blank all seven columns on
     *  the very day the map unlocks. */
    expect(DIET_HEATMAP_MIN_WEEKDAY_DAYS).toBe(2)

    const justUnlocked = analyse(consecutive(DIET_HEATMAP_MIN_DAYS, ['08:00']))
    expect(justUnlocked.heatmap.unlocked).toBe(true)
    for (const c of justUnlocked.heatmap.cells) {
      expect(c.observedDays).toBe(DIET_HEATMAP_MIN_WEEKDAY_DAYS)
    }
    expect(shade(justUnlocked, 0, 'morning')).not.toBeNull()
  })
})

describe('the words', () => {
  it('declines "posiłek" for the preposition the caption uses', () => {
    // "z 3 posiłków", not "z 3 posiłki" — the same split as entriesGenitive.
    expect(mealsGenitive(1)).toBe('posiłku')
    expect(mealsGenitive(3)).toBe('posiłków')
    expect(mealsGenitive(5)).toBe('posiłków')
    expect(mealsGenitive(0)).toBe('posiłków')
  })
})
