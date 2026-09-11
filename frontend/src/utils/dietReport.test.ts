import { describe, expect, it } from 'vitest'
import {
  MEAL_SLOT_UNSPECIFIED,
  buildDietReports,
  findDietReport,
  firstEntryDate,
  mealSlot,
  mealSlotLabel,
} from './dietReport'
import { sampleDietReportSource } from '../api/dietReportSamples'
import type { DietReportSource } from '../types/dietReport'
import type { DietMeal, DietSleepNight } from '../types/diet'

/**
 * Building one week's report out of the four diaries.
 *
 * MOST OF WHAT IS PINNED HERE IS ABSENCE, the same as on the module's screens:
 * nothing summed, nothing averaged, nothing compared with the week before, no
 * fraction of seven. Those are the additions a reasonable person makes thinking
 * them an improvement, and a comment does not fail.
 *
 * The rest is the handful of rules that are invisible until they are wrong: a
 * night belongs to the week its *morning* falls in, a null step count stays
 * null, a water row of nought is not a serving, and a meal after 22:00 has a
 * column to land in.
 */

const FIRST_ENTRY = '2026-08-26'
/** Far enough past the first entry that three weeks have closed. */
const TODAY = '2026-09-20'

function meal(overrides: Partial<DietMeal> = {}): DietMeal {
  return { id: 'm-1', kind: 'Obiad', time: '13:00', description: 'Zupa.', ...overrides }
}

function night(overrides: Partial<DietSleepNight> = {}): DietSleepNight {
  return {
    date: FIRST_ENTRY,
    fellAsleepAt: '23:00',
    wokeUpAt: '07:00',
    quality: 3,
    awakenings: 0,
    wakeFeeling: null,
    ...overrides,
  }
}

function source(overrides: Partial<DietReportSource> = {}): DietReportSource {
  return { meals: [], hydration: [], activity: [], sleep: [], ...overrides }
}

describe('firstEntryDate', () => {
  it('takes the earliest day from any of the four diaries', () => {
    const earliest = firstEntryDate(
      source({
        meals: [{ date: '2026-09-04', meals: [meal()] }],
        hydration: [{ date: '2026-09-02', waterMl: 500, glasses: 2 }],
        activity: [{ date: '2026-09-06', entries: [], steps: 3000 }],
        sleep: [night({ date: '2026-09-03' })],
      }),
    )

    expect(earliest).toBe('2026-09-02')
  })

  it('ignores rows that answer nothing', () => {
    /** A water row of 0 ml is what the seven-day chart emits for an untouched
     *  day, and an all-null night is what the sleep panel starts from. Neither
     *  is somebody writing something down, so neither may start the counting. */
    const earliest = firstEntryDate(
      source({
        hydration: [{ date: '2026-08-01', waterMl: 0, glasses: 0 }],
        sleep: [
          {
            date: '2026-08-02',
            fellAsleepAt: null,
            wokeUpAt: null,
            quality: null,
            awakenings: 0,
            wakeFeeling: null,
          },
        ],
        activity: [{ date: '2026-08-03', entries: [], steps: null }],
        meals: [{ date: '2026-09-04', meals: [meal()] }],
      }),
    )

    expect(earliest).toBe('2026-09-04')
  })

  it('answers null for a diary nobody has written in', () => {
    expect(firstEntryDate(source())).toBeNull()
  })
})

describe('mealSlot', () => {
  it('covers the whole twenty-four hours, the night included', () => {
    /** The ochre artboard bands the day 6-10, 10-14, 14-18 and 18-22, which
     *  drops everything between 22:00 and 06:00 — and night eating is exactly
     *  what a psychodietitian reads this report for. */
    expect(mealSlot('07:30')).toBe('morning')
    expect(mealSlot('13:40')).toBe('noon')
    expect(mealSlot('19:10')).toBe('evening')
    expect(mealSlot('23:40')).toBe('night')
    expect(mealSlot('02:15')).toBe('night')
    expect(mealSlot('04:59')).toBe('night')
    expect(mealSlot('05:00')).toBe('morning')
  })

  it('gives a meal with no hour a column of its own rather than a guess', () => {
    expect(mealSlot(null)).toBe(MEAL_SLOT_UNSPECIFIED)
    expect(mealSlot('nie pamiętam')).toBe(MEAL_SLOT_UNSPECIFIED)
    expect(mealSlotLabel(MEAL_SLOT_UNSPECIFIED)).toBe('Bez godziny')
  })

  it('heads the four columns with the app own words', () => {
    expect(mealSlotLabel('morning')).toBe('Rano')
    expect(mealSlotLabel('night')).toBe('Noc')
  })
})

describe('buildDietReports', () => {
  it('skips a week nobody wrote anything in', () => {
    /** The first and the third week hold a meal; the middle one holds nothing,
     *  so there is nothing to report on — the same rule
     *  `build_weekly_reports` applies in the other module. */
    const reports = buildDietReports(
      source({
        meals: [
          { date: FIRST_ENTRY, meals: [meal({ id: 'a' })] },
          { date: '2026-09-10', meals: [meal({ id: 'b' })] },
        ],
      }),
      TODAY,
    )

    expect(reports.map((report) => report.weekStart)).toEqual(['2026-09-09', '2026-08-26'])
  })

  it('leaves the week in progress out', () => {
    const reports = buildDietReports(
      source({ meals: [{ date: '2026-09-16', meals: [meal()] }] }),
      '2026-09-18',
    )

    // 16 September is inside the running week, so it supports no report at all.
    expect(reports).toEqual([])
  })

  it('holds seven days in the week own order, first day first', () => {
    const [report] = buildDietReports(
      source({ meals: [{ date: FIRST_ENTRY, meals: [meal()] }] }),
      '2026-09-02',
    )

    expect(report.days).toHaveLength(7)
    expect(report.days[0].date).toBe('2026-08-26')
    expect(report.days[6].date).toBe('2026-09-01')
    expect(report.id).toBe('week-2026-08-26')
  })

  it('counts the days that hold something, and counts nothing else', () => {
    const [report] = buildDietReports(
      source({
        meals: [
          { date: '2026-08-26', meals: [meal({ id: 'a' }), meal({ id: 'b', time: '19:00' })] },
          { date: '2026-08-28', meals: [meal({ id: 'c' })] },
        ],
        hydration: [{ date: '2026-08-30', waterMl: 750, glasses: 3 }],
      }),
      '2026-09-02',
    )

    expect(report.daysWithEntry).toBe(3)
    // Three meals across the week, and no key anywhere holding that number.
    expect(JSON.stringify(report)).not.toContain('"mealCount"')
    expect(Object.keys(report)).toEqual([
      'id',
      'weekStart',
      'weekEnd',
      'rangeLabel',
      'days',
      'daysWithEntry',
      'mealGrid',
    ])
  })

  it('sums nothing — not water, not minutes, not meals', () => {
    const [report] = buildDietReports(
      source({
        meals: [{ date: '2026-08-26', meals: [meal({ id: 'a' }), meal({ id: 'b' })] }],
        hydration: [
          { date: '2026-08-26', waterMl: 500, glasses: 2 },
          { date: '2026-08-27', waterMl: 750, glasses: 3 },
        ],
        activity: [
          {
            date: '2026-08-26',
            steps: 4000,
            entries: [
              {
                id: 'a-1',
                date: '2026-08-26',
                time: '18:00',
                kind: 'Spacer',
                kindOther: '',
                durationMinutes: 30,
                feelingAfter: 'better',
              },
            ],
          },
        ],
      }),
      '2026-09-02',
    )

    const serialised = JSON.stringify(report)
    for (const key of ['total', 'Total', 'average', 'avg', 'sum', 'score', 'percent']) {
      expect(serialised, key).not.toContain(key)
    }
    // 1250 is the two water rows added up; 1250 must appear nowhere.
    expect(serialised).not.toContain('1250')
  })

  it('puts a night in the week its morning falls in', () => {
    /** `DietSleepNight.date` is the morning the night ended on, so the night
     *  from Tuesday to Wednesday is Wednesday's — and Wednesday 2 September
     *  opens the second week, not closes the first. */
    const reports = buildDietReports(
      source({ sleep: [night({ date: '2026-09-02' })] }),
      '2026-09-20',
    )

    expect(reports).toHaveLength(1)
    expect(reports[0].weekStart).toBe('2026-09-02')
    expect(reports[0].days[0].sleep?.date).toBe('2026-09-02')
    expect(reports[0].days[6].sleep).toBeNull()
  })

  it('keeps a null step count null', () => {
    const [report] = buildDietReports(
      source({
        meals: [{ date: '2026-08-26', meals: [meal()] }],
        activity: [{ date: '2026-08-26', entries: [], steps: null }],
      }),
      '2026-09-02',
    )

    // The activity row answered nothing at all, so the day carries none —
    // and certainly not a zero.
    expect(report.days[0].activity).toBeNull()
    expect(JSON.stringify(report)).not.toContain('"steps":0')
  })

  it('treats a water row of nought as no serving rather than as a dry day', () => {
    const [report] = buildDietReports(
      source({
        meals: [{ date: '2026-08-26', meals: [meal()] }],
        hydration: [{ date: '2026-08-27', waterMl: 0, glasses: 0 }],
      }),
      '2026-09-02',
    )

    expect(report.days[1].hydration).toBeNull()
    expect(report.days[1].empty).toBe(true)
    expect(report.daysWithEntry).toBe(1)
  })

  it('orders a day meals by hour and puts the unhoured ones last', () => {
    const [report] = buildDietReports(
      source({
        meals: [
          {
            date: '2026-08-26',
            meals: [
              meal({ id: 'late', time: '23:40' }),
              meal({ id: 'none', time: null }),
              meal({ id: 'early', time: '07:15' }),
            ],
          },
        ],
      }),
      '2026-09-02',
    )

    expect(report.days[0].meals.map((entry) => entry.id)).toEqual(['early', 'late', 'none'])
  })
})

describe('the meal grid', () => {
  it('always draws the four times of day, in order', () => {
    const [report] = buildDietReports(
      source({ meals: [{ date: '2026-08-26', meals: [meal()] }] }),
      '2026-09-02',
    )

    expect(report.mealGrid.slots).toEqual(['morning', 'noon', 'evening', 'night'])
    expect(report.mealGrid.rows).toHaveLength(7)
  })

  it('adds the fifth column only when a meal in the week has no hour', () => {
    const [withHours] = buildDietReports(
      source({ meals: [{ date: '2026-08-26', meals: [meal()] }] }),
      '2026-09-02',
    )
    const [withoutHours] = buildDietReports(
      source({ meals: [{ date: '2026-08-26', meals: [meal({ time: null })] }] }),
      '2026-09-02',
    )

    expect(withHours.mealGrid.slots).not.toContain(MEAL_SLOT_UNSPECIFIED)
    expect(withoutHours.mealGrid.slots).toContain(MEAL_SLOT_UNSPECIFIED)
  })

  it('carries the meals themselves, so a cell can draw a dot each and no count', () => {
    const [report] = buildDietReports(
      source({
        meals: [
          {
            date: '2026-08-26',
            meals: [meal({ id: 'a', time: '13:00' }), meal({ id: 'b', time: '15:30' })],
          },
        ],
      }),
      '2026-09-02',
    )

    const noon = report.mealGrid.rows[0].cells.find((cell) => cell.slot === 'noon')

    expect(noon?.meals.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(JSON.stringify(report.mealGrid)).not.toContain('"count"')
  })
})

describe('findDietReport', () => {
  it('answers null for an id no week carries', () => {
    const reports = buildDietReports(
      source({ meals: [{ date: FIRST_ENTRY, meals: [meal()] }] }),
      '2026-09-02',
    )

    expect(findDietReport(reports, 'week-2026-08-26')?.weekStart).toBe('2026-08-26')
    expect(findDietReport(reports, 'week-2026-01-01')).toBeNull()
    expect(findDietReport(reports, 'nie-ma-takiego')).toBeNull()
  })

  it('answers null for the id of the week still in progress', () => {
    /** THE CASE A TYPED ADDRESS ACTUALLY REACHES. The list never links to the
     *  running week, so the only way to ask for it is to work the id out and
     *  type it — and the answer has to be the same "no such report" a week
     *  with no entries gets, rather than a half-finished document. A report
     *  describes a week that has ended; see `completedDietWeeks`. */
    const source_ = source({
      meals: [
        { date: FIRST_ENTRY, meals: [meal({ id: 'closed' })] },
        // Inside the week 9-15 September, which is still running on the 11th.
        { date: '2026-09-10', meals: [meal({ id: 'running' })] },
      ],
    })
    const reports = buildDietReports(source_, '2026-09-11')

    // The closed week the first meal is in is there; the one between them held
    // nothing, so it has no report either.
    expect(reports.map((report) => report.id)).toEqual(['week-2026-08-26'])
    // And the week holding the 10 September meal is not addressable at all.
    expect(findDietReport(reports, 'week-2026-09-09')).toBeNull()

    // Four days later the same id answers with a report, which is the only
    // thing that changed: nothing was written in between.
    const afterItClosed = buildDietReports(source_, '2026-09-16')

    expect(findDietReport(afterItClosed, 'week-2026-09-09')?.weekStart).toBe('2026-09-09')
  })
})

describe('the sample diary', () => {
  it('builds several weeks and leaves the running one out', () => {
    const today = new Date(2026, 8, 20)
    const reports = buildDietReports(sampleDietReportSource(today), '2026-09-20')

    expect(reports.length).toBeGreaterThanOrEqual(3)
    for (const report of reports) expect(report.weekEnd < '2026-09-20').toBe(true)
  })

  it('is ragged on purpose, so every branch is reachable by eye', () => {
    const reports = buildDietReports(sampleDietReportSource(new Date(2026, 8, 20)), '2026-09-20')
    const days = reports.flatMap((report) => report.days)
    const meals = days.flatMap((day) => day.meals)

    expect(days.some((day) => day.empty)).toBe(true)
    expect(meals.some((entry) => entry.time === null)).toBe(true)
    expect(meals.some((entry) => entry.kind === null)).toBe(true)
    expect(meals.some((entry) => entry.description === '')).toBe(true)
    expect(meals.some((entry) => mealSlot(entry.time) === 'night')).toBe(true)
    expect(days.some((day) => day.activity?.steps === null)).toBe(true)
    expect(days.some((day) => day.hydration === null)).toBe(true)
  })

  it('moves with the day it is asked for, so it never becomes stale demo data', () => {
    const earlier = buildDietReports(sampleDietReportSource(new Date(2026, 8, 20)), '2026-09-20')
    const later = buildDietReports(sampleDietReportSource(new Date(2026, 9, 20)), '2026-10-20')

    expect(earlier[0].weekStart).not.toBe(later[0].weekStart)
  })
})
