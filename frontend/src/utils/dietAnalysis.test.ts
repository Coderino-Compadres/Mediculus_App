import { describe, expect, it } from 'vitest'
import {
  DIET_ANALYSIS_WINDOW_DAYS,
  DIET_HEATMAP_MIN_DAYS,
  DIET_HEATMAP_MIN_WEEKDAY_DAYS,
  DIET_SLOT_STARTS,
  buildDietAnalysis,
  mealDensityColor,
  mealSlot,
} from './dietAnalysis'
import { addDays, fromIsoDate, toIsoDate } from './days'
import { weekdayIndex } from './analysis'
import { MEAL_KINDS } from './meals'
import type { EmotionName } from './emotions'
import type { DietJournalDay, DietMeal } from '../types/diet'
import type { DietAnalysis, DietEmotionCross } from '../types/dietAnalysis'

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
      // No chip picked, which is the ordinary meal these fixtures are about.
      // The emotion charts have their own fixtures further down.
      emotions: [],
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

/**
 * §11's emotion charts.
 *
 * TWO THINGS ARE WORTH GUARDING ABOVE THE REST, and they are the two the shape
 * exists for:
 *
 * 1. **The unit is a meal, not a day.** An emotion hangs off a meal here, so
 *    two difficult meals on one Tuesday are two things that happened. The other
 *    charts on this screen count days, which is why this is easy to "fix" into
 *    a bug.
 * 2. **An unrated chip is not a zero.** It counts towards how often a feeling
 *    came up and towards nothing else. Folded into an average as 0 it would
 *    read somebody's silence back to them as calm.
 */

/** One meal with its chips, for the fixtures below. */
function meal(
  id: string,
  time: string | null,
  kind: string | null,
  emotions: { emotion: EmotionName; intensity: number | null }[],
): DietMeal {
  return { id, kind, time, description: 'kanapka', emotions }
}

function dayOf(date: string, meals: DietMeal[]): DietJournalDay {
  return { date, meals }
}

describe('the emotions ranking', () => {
  it('counts a meal, not a day', () => {
    const analysis = analyse([
      dayOf(isoDaysAgo(1), [
        meal('a', '08:00', 'Śniadanie', [{ emotion: 'Lęk', intensity: 5 }]),
        meal('b', '19:00', 'Kolacja', [{ emotion: 'Lęk', intensity: 7 }]),
      ]),
    ])

    // One day, two meals — and 'Lęk' came up twice, which is what happened.
    expect(analysis.emotions.ranking).toEqual([
      { emotion: 'Lęk', meals: 2, ratedMeals: 2, avgIntensity: 6 },
    ])
  })

  it('leaves an unrated chip out of the average and in the count', () => {
    const analysis = analyse([
      dayOf(isoDaysAgo(1), [
        meal('a', '08:00', null, [{ emotion: 'Wstyd', intensity: 8 }]),
        meal('b', '19:00', null, [{ emotion: 'Wstyd', intensity: null }]),
      ]),
    ])

    // 8, not 4: the second chip says the feeling was there and says nothing
    // about how strong it was.
    expect(analysis.emotions.ranking).toEqual([
      { emotion: 'Wstyd', meals: 2, ratedMeals: 1, avgIntensity: 8 },
    ])
  })

  it('keeps an emotion nobody rated, with no average', () => {
    /* Being felt is what puts a row on the list; §05's rule is that no field
       blocks a save, so a chip with the slider untouched is an ordinary answer
       rather than an unfinished one. */
    const analysis = analyse([
      dayOf(isoDaysAgo(1), [meal('a', '08:00', null, [
        { emotion: 'Spokój', intensity: null },
      ])]),
    ])

    expect(analysis.emotions.ranking).toEqual([
      { emotion: 'Spokój', meals: 1, ratedMeals: 0, avgIntensity: null },
    ])
  })

  it('runs from the most often picked, not the most strongly felt', () => {
    /* The opposite of the psychotherapy report's ranking, and deliberately: this
       section is *named* for frequency. */
    const analysis = analyse([
      dayOf(isoDaysAgo(1), [
        meal('a', '08:00', null, [
          { emotion: 'Lęk', intensity: 1 },
          { emotion: 'Radość', intensity: 10 },
        ]),
        meal('b', '13:00', null, [{ emotion: 'Lęk', intensity: 1 }]),
      ]),
    ])

    expect(analysis.emotions.ranking.map((row) => row.emotion)).toEqual(['Lęk', 'Radość'])
  })

  it('breaks a tie on the average, and an unrated row sorts below a rated one', () => {
    const analysis = analyse([
      dayOf(isoDaysAgo(1), [meal('a', '08:00', null, [
        { emotion: 'Radość', intensity: null },
        { emotion: 'Smutek', intensity: 0 },
        { emotion: 'Frustracja', intensity: 9 },
      ])]),
    ])

    // A rated nought is a measurement and a null is not, so 'Smutek' at 0 still
    // outranks a chip carrying no answer at all.
    expect(analysis.emotions.ranking.map((row) => row.emotion)).toEqual([
      'Frustracja', 'Smutek', 'Radość',
    ])
  })

  it('counts meals rather than chips for the caption', () => {
    /* A meal carrying three chips is one meal. Without that the caption would
       claim more meals than the window holds. */
    const analysis = analyse([
      dayOf(isoDaysAgo(1), [
        meal('a', '08:00', null, [
          { emotion: 'Lęk', intensity: 5 },
          { emotion: 'Stres', intensity: 6 },
        ]),
        meal('b', '13:00', null, []),
      ]),
    ])

    expect(analysis.emotions.mealsWithEmotion).toBe(1)
  })

  it('is empty for a window of meals nobody picked a chip at', () => {
    // Not a row of zeroes: the screen draws no emotion card at all for this.
    const analysis = analyse(consecutive(5, ['08:00']))

    expect(analysis.emotions.ranking).toEqual([])
    expect(analysis.emotions.mealsWithEmotion).toBe(0)
  })

  it('ignores meals older than the window', () => {
    const analysis = analyse([
      dayOf(isoDaysAgo(1), [meal('a', '08:00', null, [{ emotion: 'Lęk', intensity: 5 }])]),
      dayOf(isoDaysAgo(DIET_ANALYSIS_WINDOW_DAYS + 5), [
        meal('old', '08:00', null, [{ emotion: 'Radość', intensity: 9 }]),
      ]),
    ])

    expect(analysis.emotions.ranking.map((row) => row.emotion)).toEqual(['Lęk'])
  })
})

describe('the emotion crossings', () => {
  /** Two meals on one day: a calm breakfast and an ashamed midnight snack. */
  function twoMeals(): DietJournalDay[] {
    return [
      dayOf(isoDaysAgo(1), [
        meal('a', '08:00', 'Śniadanie', [{ emotion: 'Spokój', intensity: 6 }]),
        meal('b', '23:40', 'Przekąska', [{ emotion: 'Wstyd', intensity: 4 }]),
      ]),
    ]
  }

  function cellOf(cross: DietEmotionCross, emotion: string, column: string): number {
    const row = cross.rows.find((entry) => entry.emotion === emotion)
    const found = row?.cells.find((entry) => entry.column === column)
    if (found === undefined) throw new Error(`no cell ${emotion}/${column}`)
    return found.meals
  }

  it('puts a feeling in the part of the day its meal fell in', () => {
    const { byTimeOfDay } = analyse(twoMeals()).emotions

    expect(cellOf(byTimeOfDay, 'Spokój', 'morning')).toBe(1)
    expect(cellOf(byTimeOfDay, 'Spokój', 'night')).toBe(0)
    // 23:40 is night, not "off the end of the day" — the bucket wraps midnight,
    // which is the whole reason this module departs from the artboard's bands.
    expect(cellOf(byTimeOfDay, 'Wstyd', 'night')).toBe(1)
  })

  it('keeps the four parts of the day even when nothing fell in them', () => {
    /* A column holding meals but no chip is a measured zero; a column holding no
       meal is an absence. The screen needs both, so neither is dropped. */
    const { byTimeOfDay } = analyse(twoMeals()).emotions

    expect(byTimeOfDay.columns.map((column) => column.key)).toEqual([
      'morning', 'noon', 'evening', 'night',
    ])
    expect(byTimeOfDay.columns.find((column) => column.key === 'noon')?.meals).toBe(0)
    expect(byTimeOfDay.columns.find((column) => column.key === 'morning')?.meals).toBe(1)
  })

  it('adds the "no hour" column only when the window holds such a meal', () => {
    // The same rule the report's grid follows: a permanently empty column reads
    // as a question nobody answered rather than as one nobody was asked.
    const timed = analyse(twoMeals()).emotions.byTimeOfDay
    expect(timed.columns.map((column) => column.key)).not.toContain('unspecified')

    const untimed = analyse([
      dayOf(isoDaysAgo(1), [meal('a', null, null, [{ emotion: 'Lęk', intensity: 3 }])]),
    ]).emotions.byTimeOfDay

    expect(untimed.columns.map((column) => column.key)).toContain('unspecified')
    expect(cellOf(untimed, 'Lęk', 'unspecified')).toBe(1)
  })

  it('crosses a feeling with the kind of meal it came up at', () => {
    const { byKind } = analyse(twoMeals()).emotions

    expect(cellOf(byKind, 'Spokój', 'Śniadanie')).toBe(1)
    expect(cellOf(byKind, 'Wstyd', 'Przekąska')).toBe(1)
    expect(cellOf(byKind, 'Wstyd', 'Śniadanie')).toBe(0)
    // Six kinds always, in §04's own order — which is also the order of a day.
    expect(byKind.columns.slice(0, 6).map((column) => column.key)).toEqual([...MEAL_KINDS])
  })

  it('gives meals saved without a kind a column of their own', () => {
    const { byKind } = analyse([
      dayOf(isoDaysAgo(1), [meal('a', '08:00', null, [{ emotion: 'Lęk', intensity: 3 }])]),
    ]).emotions

    expect(cellOf(byKind, 'Lęk', 'unspecified')).toBe(1)
    expect(byKind.columns.at(-1)?.label).toBe('Bez rodzaju')
  })

  it('cuts the window into seven-day buckets from its first day', () => {
    /* Not Mondays, and not the report's week either: a bucket here is seven days
       of a rolling window. Thirty days is four sevens and two, so the last one
       is short and stays short. */
    const { byWeek } = analyse(consecutive(DIET_ANALYSIS_WINDOW_DAYS, ['08:00'])).emotions

    expect(byWeek.columns).toHaveLength(5)
    expect(byWeek.columns.map((column) => column.label)).toEqual([
      'Tyg. 1', 'Tyg. 2', 'Tyg. 3', 'Tyg. 4', 'Tyg. 5',
    ])
    // Four full buckets and a two-day tail — said in the column's own count
    // rather than hidden by rescaling it.
    expect(byWeek.columns.map((column) => column.meals)).toEqual([7, 7, 7, 7, 2])
    expect(byWeek.columns[0].hint).toBeTruthy()
  })

  it('puts a meal in the bucket its day falls in', () => {
    const history = [
      // Today — the last bucket of a full window.
      dayOf(isoDaysAgo(0), [meal('now', '08:00', null, [{ emotion: 'Radość', intensity: 8 }])]),
      // The window's very first day, so the first bucket.
      dayOf(isoDaysAgo(DIET_ANALYSIS_WINDOW_DAYS - 1), [
        meal('then', '08:00', null, [{ emotion: 'Lęk', intensity: 2 }]),
      ]),
    ]
    const { byWeek } = analyse(history).emotions

    expect(cellOf(byWeek, 'Lęk', byWeek.columns[0].key)).toBe(1)
    expect(cellOf(byWeek, 'Lęk', byWeek.columns.at(-1)!.key)).toBe(0)
    expect(cellOf(byWeek, 'Radość', byWeek.columns.at(-1)!.key)).toBe(1)
  })

  it('lists the same emotions, in the same order, as the ranking', () => {
    /* The table reads top to bottom in the order of the bars beside it. Two
       orders for one set of rows is how a screen ends up contradicting itself. */
    const { ranking, byTimeOfDay, byKind, byWeek } = analyse([
      dayOf(isoDaysAgo(1), [
        meal('a', '08:00', 'Śniadanie', [
          { emotion: 'Lęk', intensity: 5 },
          { emotion: 'Radość', intensity: 9 },
        ]),
        meal('b', '19:00', 'Kolacja', [{ emotion: 'Lęk', intensity: 6 }]),
      ]),
    ]).emotions

    const order = ranking.map((row) => row.emotion)
    for (const cross of [byTimeOfDay, byKind, byWeek]) {
      expect(cross.rows.map((row) => row.emotion)).toEqual(order)
    }
  })

  it("gives every row the ranking's own count, spread across its cells", () => {
    const { byTimeOfDay } = analyse(twoMeals()).emotions

    for (const row of byTimeOfDay.rows) {
      const spread = row.cells.reduce((sum, cell) => sum + cell.meals, 0)
      expect(spread).toBe(row.meals)
    }
  })

  it('has no rows at all when nothing was picked', () => {
    const { byTimeOfDay, byKind, byWeek } = analyse(consecutive(5, ['08:00'])).emotions

    // Columns still exist — meals happened — but no emotion has a row, because
    // a row of zeroes would read as a question answered with "no".
    expect(byTimeOfDay.rows).toEqual([])
    expect(byKind.rows).toEqual([])
    expect(byWeek.rows).toEqual([])
    expect(byTimeOfDay.columns.length).toBeGreaterThan(0)
  })
})
