/**
 * Turning the diet module's four diaries into one weekly report.
 *
 * Pure, and takes "today" as an argument — no `new Date()` anywhere in this
 * file, for the reason `utils/dayLock.ts` spells out at length. The screens
 * read the clock through `hooks/useCurrentDay.ts` and pass the day in, so a
 * report list left open across midnight gains its new week without a reload.
 *
 * **NOTHING IS SUMMED AND NOTHING IS SCORED.** No total meals for a week, no
 * millilitres added up, no minutes of activity, no averages, no comparison
 * with the week before. The report is a listing — "data, co się działo" — which
 * is what the client asked for and what §15 says about the whole module ("nie
 * liczy jedzenia, tylko je opisuje"). The single count in the whole file is
 * `daysWithEntry`, which counts *days a patient wrote something on* and is
 * rendered as a plain number, never as a fraction of seven.
 *
 * What it deliberately does not build is listed on `types/dietReport.ts`: the
 * three §05 sections, and "zmiany od ostatniej wizyty".
 */

import type {
  DietMealSlot,
  DietReportDay,
  DietReportMealGrid,
  DietReportMealRow,
  DietReportSource,
  DietWeeklyReport,
} from '../types/dietReport'
import type {
  DietActivityDay,
  DietMeal,
  DietSleepNight,
  HydrationDayTotal,
} from '../types/diet'
import { TIME_OF_DAY_LABELS, TIME_OF_DAY_VALUES } from './timeOfDay'
import type { TimeOfDay } from './timeOfDay'
import { completedDietWeeks, dietWeekDays, dietWeekRangeLabel } from './dietWeeks'

/** The column holding meals saved without an hour. */
export const MEAL_SLOT_UNSPECIFIED = 'unspecified'

/**
 * Where the four parts of the day begin, in minutes from midnight.
 *
 * **THESE BOUNDARIES ARE NEW AND THEY ARE THIS MODULE'S OWN.**
 * `utils/timeOfDay.ts` holds the vocabulary — Rano, Południe, Wieczór, Noc —
 * and deliberately holds *no clock mapping at all*, because in the
 * psychotherapy module "pora dnia" is a chip the patient taps, never something
 * derived from a timestamp. A meal, by contrast, carries an hour and no chip,
 * so somewhere has to say which hour is which part of the day, and this is that
 * place. The vocabulary is reused rather than reinvented so the two modules use
 * one set of words.
 *
 * **THE NIGHT IS COVERED ON PURPOSE, AND THIS IS A DEPARTURE FROM THE MOCKUP.**
 * The ochre artboard's own bands are 6:00-10:00, 10:00-14:00, 14:00-18:00 and
 * 18:00-22:00 — which silently drop everything between 22:00 and 06:00. Night
 * eating is precisely the thing a psychodietitian is reading this report for,
 * so a grid that loses a 23:40 meal would be worse than no grid. The four
 * buckets below therefore meet end to end and cover the whole twenty-four
 * hours, with `night` wrapping around midnight.
 *
 * TODO(klientka): the exact cut-off hours are the team's, not hers. Worth
 * confirming — a breakfast at 4:50 lands in "Noc" today.
 */
const SLOT_STARTS: readonly { from: number; slot: TimeOfDay }[] = [
  { from: 5 * 60, slot: 'morning' },
  { from: 11 * 60, slot: 'noon' },
  { from: 17 * 60, slot: 'evening' },
  { from: 22 * 60, slot: 'night' },
]

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

/** 'HH:MM' → minutes since midnight, or null for anything that is not one. */
function minutesOfDay(time: string): number | null {
  const match = TIME_PATTERN.exec(time.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Which column a meal belongs in.
 *
 * A meal with no hour, or with an hour nothing can read, goes to
 * `'unspecified'` rather than being guessed into a slot or dropped: it is an
 * ordinary entry (§05), and the grid owes it a column of its own.
 */
export function mealSlot(time: string | null): DietMealSlot {
  if (!time) return MEAL_SLOT_UNSPECIFIED
  const minutes = minutesOfDay(time)
  if (minutes === null) return MEAL_SLOT_UNSPECIFIED

  let slot: TimeOfDay = 'night'
  for (const boundary of SLOT_STARTS) {
    if (minutes >= boundary.from) slot = boundary.slot
  }
  // Before 05:00 the loop matches nothing and the answer stays 'night', which
  // is the correct one: the night bucket wraps midnight.
  return slot
}

/** What a column is headed. The four times of day keep the app's own labels. */
export function mealSlotLabel(slot: DietMealSlot): string {
  return slot === MEAL_SLOT_UNSPECIFIED ? 'Bez godziny' : TIME_OF_DAY_LABELS[slot]
}

/** Meals in the order they were eaten, with the unhoured ones last — the same
 *  order `core/meals.py` puts a day's meals in, so the report and the history
 *  list one day the same way. */
function byHour(meals: DietMeal[]): DietMeal[] {
  return [...meals].sort((left, right) => {
    if (left.time === null) return right.time === null ? 0 : 1
    if (right.time === null) return -1
    return left.time.localeCompare(right.time)
  })
}

/**
 * Whether a night was described at all.
 *
 * `emptySleepNight()` is a real object with every answer missing — it is what
 * the sleep panel starts from — so its presence in the data says nothing.
 * `awakenings` counts as an answer only above zero: zero is both "an unbroken
 * night" and the control's own starting value, and the two cannot be told
 * apart, so the quieter reading wins.
 */
function hasSleep(night: DietSleepNight): boolean {
  return (
    night.fellAsleepAt !== null ||
    night.wokeUpAt !== null ||
    night.quality !== null ||
    night.wakeFeeling !== null ||
    night.awakenings > 0
  )
}

function hasActivity(day: DietActivityDay): boolean {
  return day.entries.length > 0 || day.steps !== null
}

/** A water row of 0 ml is what the seven-day chart emits for a day nobody
 *  recorded anything on, so it is not a serving and must not make a day count
 *  as written-on. */
function hasHydration(total: HydrationDayTotal): boolean {
  return total.waterMl > 0
}

/**
 * The earliest day anything was written on, across all four diaries — the day
 * the patient's weeks are counted from.
 *
 * ISO strings compare correctly, so this is a `min` over strings. Null for a
 * diary nobody has written in, which is the ordinary state of a new account.
 */
export function firstEntryDate(source: DietReportSource): string | null {
  const dates = [
    ...source.meals.filter((day) => day.meals.length > 0).map((day) => day.date),
    ...source.hydration.filter(hasHydration).map((total) => total.date),
    ...source.activity.filter(hasActivity).map((day) => day.date),
    ...source.sleep.filter(hasSleep).map((night) => night.date),
  ]

  return dates.length === 0 ? null : dates.reduce((first, date) => (date < first ? date : first))
}

function buildMealGrid(days: DietReportDay[]): DietReportMealGrid {
  const rows: DietReportMealRow[] = days.map((day) => ({
    date: day.date,
    cells: [],
  }))

  const slots: DietMealSlot[] = [...TIME_OF_DAY_VALUES]
  // The fifth column exists only when the week actually holds a meal with no
  // hour. An always-present empty column would read as a question the patient
  // failed to answer rather than as one they were never asked.
  if (days.some((day) => day.meals.some((meal) => mealSlot(meal.time) === MEAL_SLOT_UNSPECIFIED))) {
    slots.push(MEAL_SLOT_UNSPECIFIED)
  }

  days.forEach((day, index) => {
    rows[index].cells = slots.map((slot) => ({
      slot,
      meals: day.meals.filter((meal) => mealSlot(meal.time) === slot),
    }))
  })

  return { slots, rows }
}

/**
 * Every report the four diaries support, newest first.
 *
 * Two kinds of week are absent, both matching what the psychotherapy module
 * does with its own: **the week in progress** (a report describes a week that
 * has ended — see `completedDietWeeks`, which is also where the departure from
 * the mockups' "w toku" card is argued) and **a week nobody wrote anything in**
 * (the diaries are the only source, so there would be nothing to list).
 */
export function buildDietReports(
  source: DietReportSource,
  today: string,
): DietWeeklyReport[] {
  const weeks = completedDietWeeks(firstEntryDate(source), today)
  if (weeks.length === 0) return []

  const mealsByDate = new Map(source.meals.map((day) => [day.date, day]))
  const hydrationByDate = new Map(source.hydration.map((total) => [total.date, total]))
  const activityByDate = new Map(source.activity.map((day) => [day.date, day]))
  const sleepByDate = new Map(source.sleep.map((night) => [night.date, night]))

  const reports = weeks.map((week): DietWeeklyReport => {
    const days = dietWeekDays(week).map((date): DietReportDay => {
      const meals = byHour(mealsByDate.get(date)?.meals ?? [])

      const hydrationRow = hydrationByDate.get(date)
      const hydration = hydrationRow && hasHydration(hydrationRow) ? hydrationRow : null

      const activityRow = activityByDate.get(date)
      const activity = activityRow && hasActivity(activityRow) ? activityRow : null

      // Matched on the *morning* the night ended on, which is what
      // `DietSleepNight.date` holds — so a night belongs to the week its
      // morning falls in. See the field's note in types/dietReport.ts.
      const sleepRow = sleepByDate.get(date)
      const sleep = sleepRow && hasSleep(sleepRow) ? sleepRow : null

      return {
        date,
        meals,
        hydration,
        sleep,
        activity,
        empty: meals.length === 0 && !hydration && !sleep && !activity,
      }
    })

    return {
      id: week.id,
      weekStart: week.start,
      weekEnd: week.end,
      rangeLabel: dietWeekRangeLabel(week.start, week.end),
      days,
      daysWithEntry: days.filter((day) => !day.empty).length,
      mealGrid: buildMealGrid(days),
    }
  })

  return reports.filter((report) => report.daysWithEntry > 0)
}

/** One report by its route id, or null when the id names no week with entries.
 *  A typed-in id and a week nobody wrote in answer the same way, because
 *  neither tells the patient anything they can act on. */
export function findDietReport(
  reports: DietWeeklyReport[],
  id: string,
): DietWeeklyReport | null {
  return reports.find((report) => report.id === id) ?? null
}
