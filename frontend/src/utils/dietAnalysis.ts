/**
 * The aggregation behind the diet module's "Analiza" screen.
 *
 * Pure functions over the days `GET /api/diet/meals/` already answers with — the
 * same call "Dzienniczki żywieniowe" makes (`fetchDietHistory`), so a number on
 * this screen cannot disagree with the meal it came from. Kept out of the page
 * for the same reason `core/diet_reports.py` is kept out of its view: this is
 * where the judgements live, and they have to be testable without mounting a
 * screen.
 *
 * Nothing here reaches the network, nothing is stored and nothing reads a clock:
 * `today` arrives as an argument. An analysis is recomputed on every visit,
 * which is what lets the window roll.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODO(backend): THREE OF THE MODULE'S FIVE DIARIES CANNOT BE DRAWN AT ALL, and
 * the reason is a missing view rather than missing work. Each of these already
 * exists server-side, pure and taking its range as arguments — only an endpoint
 * with `start`/`end` parameters is absent, so the browser can reach a day of
 * them and never a month:
 *
 *   - sleep         → `core/sleep.load_history(id_medical, start, end)`
 *                     `GET /api/diet/sleep/` answers for this morning only.
 *   - activity      → `core/activity.load_history(id_medical, start, end)`
 *                     `GET /api/diet/activity/` answers for today only.
 *   - hydration     → `core/hydration.water_by_day(id_medical, start, end)`
 *                     `GET /api/diet/hydration/` carries exactly seven days
 *                     (`WEEK_DAYS` in core/drinks.py) and takes no range.
 *
 * Supplements have no history in either direction: `supplement_intake` records a
 * tick per day, but `GET /api/diet/supplements/` reports only `taken_today`, and
 * a preparation is a regimen rather than a day's entry — `first_entry_date` in
 * core/diet_reports.py leaves it out of the four diaries deliberately.
 *
 * **`/api/diet/reports/` IS NOT THE WAY ROUND THIS.** It does carry sleep,
 * activity and water per day, but only for weeks that have *ended*
 * (`completed_diet_weeks`) and only for weeks holding an entry — so between one
 * and seven of the most recent days are always missing from it, and a "last 30
 * days" assembled that way would be a window that stops short of today without
 * saying so.
 *
 * §11's EMOTION CHARTS ARE BUILT — the ranking and the three crossings at the
 * foot of this file. They were blocked for one reason, which is that
 * `diet_meal` had no emotion to read; `diet_meal_emotion` and §04's picker
 * closed that, so they were built rather than re-argued.
 *
 * TODO(§05): two of the mockup's §11 charts remain — głód fizyczny wobec
 * emocjonalnego, and the relation between stress and appetite. Both read a
 * psychodietetic context of a meal that **still has no column**: §04/§05's form
 * asks what was felt and does not ask a mood, two hunger scales, the situation
 * before the meal, fullness, satisfaction or the body's reaction. They join this
 * file together with those columns and the form that writes them, and not
 * before — the same line `types/dietReport.ts` and `core/diet_reports.py` hold.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { addDays, fromIsoDate, toIsoDate } from './days'
import { rangeLabel, weekdayIndex } from './analysis'
import { MEAL_SLOT_UNSPECIFIED } from './dietReport'
import { EMOTION_COLORS, type EmotionName } from './emotions'
import { MEAL_KINDS } from './meals'
import { TIME_OF_DAY_LABELS, TIME_OF_DAY_VALUES, type TimeOfDay } from './timeOfDay'
import type { DietJournalDay, DietMeal } from '../types/diet'
import type { DietMealSlot } from '../types/dietReport'
import type {
  DietAnalysis,
  DietEmotionCross,
  DietEmotionCrossColumn,
  DietEmotionShare,
  DietEmotions,
  DietHeatmap,
  DietHeatmapCell,
  DietSlotShare,
} from '../types/dietAnalysis'

/** The rolling window's ceiling, and the same thirty days the psychotherapy
 *  analysis settled on — until the account is that old the window is simply as
 *  long as its history. Declared here rather than imported from
 *  `utils/analysis.ts` for the reason DIET_HEATMAP_MIN_DAYS is: the two modules
 *  have to be free to move apart, and they already disagree about what a week
 *  is. */
export const DIET_ANALYSIS_WINDOW_DAYS = 30

/**
 * How many days must carry a meal *with an hour* before the grid is drawn.
 *
 * Fourteen, the same number as HEATMAP_MIN_DAYS and for the same arithmetic: the
 * grid is 7 × 4 squares, and below two weeks most weekdays appear once, so a
 * single late Tuesday supper renders as a solid "this is when you eat" that the
 * patient may well believe. Above it every weekday has occurred at least twice
 * and a square rests on more than one day.
 *
 * It counts days with a *timed* meal specifically, not days with any meal: a
 * meal saved without an hour cannot be placed on this grid at all (§05 makes it
 * an ordinary entry, not an error), so thirty days of which three carry an hour
 * would otherwise unlock a map drawn from three points.
 *
 * Its own constant rather than an import from `utils/analysis.ts`: the number
 * agreeing today is a coincidence of two 7 × 4 grids, not a shared rule, and the
 * psychotherapy threshold is about a question the patient answers by tapping a
 * chip while this one is about an hour typed next to a meal. Tying them together
 * would mean a change to one module silently moving the other's product rule.
 */
export const DIET_HEATMAP_MIN_DAYS = 14

/**
 * How many days of one weekday must carry a timed meal before that column is
 * coloured at all.
 *
 * **THE MAP-WIDE THRESHOLD DOES NOT GUARANTEE THIS ONE.** DIET_HEATMAP_MIN_DAYS
 * was chosen for exactly this arithmetic — its own comment says "above it every
 * weekday has occurred at least twice and a square rests on more than one day" —
 * but that only holds for somebody who writes every day. Fourteen timed days
 * spread unevenly over a thirty-day window can leave a single Saturday standing
 * for every Saturday, and since a square is now coloured against its own
 * weekday's observations (see `buildHeatmap`), one observation would render as
 * a full-depth "this is when you eat" drawn from one day of evidence. That is
 * the same mistake DIET_HEATMAP_MIN_DAYS exists to prevent, one level down.
 *
 * Two, and not three, because three blanks the whole grid for precisely the
 * patient who just unlocked it: measured on real windows, every realistic shape
 * that reaches fourteen timed days lands on exactly two observations per
 * weekday (a 14-day window written daily gives 2-2-2-2-2-2-2), so a threshold of
 * three would drop all seven columns the day the map appears.
 *
 * A column below it is neither "brak wpisu" nor a zero — it is a third state,
 * drawn without a colour and read out as too few days. See `types/dietAnalysis.ts`.
 */
export const DIET_HEATMAP_MIN_WEEKDAY_DAYS = 2

/**
 * How many days one column of "Emocje w czasie" covers.
 *
 * Seven, because a week is the unit a patient and a specialist already talk in
 * — but **it is not this module's week**. §10's report counts seven days from
 * the patient's first entry and anchors them in `patient.diet_week_start`; a
 * bucket here is seven days of a *rolling* window and moves every day, so
 * "Tyg. 1" names different dates tomorrow. The two must not be unified: an
 * anchored week is what makes a report citable, and a rolling one is what makes
 * this view current. The dates are in every column's hint so nobody has to
 * guess which kind they are looking at.
 *
 * Its own constant rather than `DAYS_PER_WEEK_BAR` from utils/analysis.ts, for
 * the reason DIET_HEATMAP_MIN_DAYS is its own: the number agreeing today is a
 * coincidence of two modules both cutting at a week, and tying them together
 * would let a change to one silently move the other.
 */
export const DAYS_PER_DIET_TREND_BAR = 7

/**
 * Where the four parts of the day begin, in minutes from midnight.
 *
 * **THIS IS A TRANSCRIPTION OF `SLOT_STARTS` IN `backend/core/diet_reports.py`
 * AND MUST NOT DRIFT FROM IT.** The server assigns a meal to a slot when it
 * builds a weekly report; this screen has to do the same for a window the
 * reports endpoint cannot answer for, and a frontend that cut the day at
 * different hours would put the same 17:00 lunch in "Południe" on one screen and
 * "Wieczór" on the other.
 *
 * TODO(backend): pin the two together with a cross-language test, in the shape
 * `backend/core/tests/test_emotions.py` already uses for `utils/emotions.ts` and
 * `test_meals.py` for `utils/meals.ts` — parse this array out of the file and
 * compare it to the Python tuple, boundary for boundary. Until that exists the
 * duplication is held by this comment alone. Added to the backend list at the
 * head of this file.
 *
 * THE NIGHT COVERS MIDNIGHT, which is the server's own departure from the
 * mockup: §11's bands (6-10, 10-14, 14-18, 18-22) silently drop everything
 * between 22:00 and 06:00, and a grid that lost a 23:40 meal would be worse than
 * no grid. The four buckets below meet end to end and cover the whole
 * twenty-four hours, with `night` wrapping round.
 */
export const DIET_SLOT_STARTS = [
  { minutes: 5 * 60, slot: 'morning' },
  { minutes: 11 * 60, slot: 'noon' },
  { minutes: 17 * 60, slot: 'evening' },
  { minutes: 22 * 60, slot: 'night' },
] as const satisfies readonly { minutes: number; slot: TimeOfDay }[]

/** 'HH:MM' as minutes from midnight, or null when it is not that.
 *
 *  `/api/diet/meals/` sends exactly 'HH:MM' and nothing else: `meal_row` in
 *  `core/meals.py` builds the field with `strftime('%H:%M')` rather than letting
 *  a serializer format it, so there is no second shape to accept. The seconds
 *  and fraction below are tolerated anyway, deliberately and redundantly — a
 *  hand-built field is one edit away from becoming a DRF TimeField, and the cost
 *  of accepting a shape that never arrives is nothing, while the cost of
 *  rejecting one that starts arriving is a meal silently moved to the
 *  unspecified column.
 *
 *  What it rejects lands in that column, which is where the server puts the same
 *  value: `datetime.time.fromisoformat` raising is `meal_slot`'s own route to
 *  MEAL_SLOT_UNSPECIFIED. The two do not agree character for character on
 *  exotic input — Python 3.11+ also accepts '08', '0800' and an offset — but no
 *  such string can leave `meal_row`. */
function minutesOfDay(time: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(time)
  if (match === null) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

/**
 * Which part of the day a meal falls in. `time` is 'HH:MM' or null.
 *
 * A meal with no hour, or an hour nothing can read, goes to
 * MEAL_SLOT_UNSPECIFIED rather than being guessed into a slot or dropped: it is
 * an ordinary entry (§05's "żadne pole nie blokuje zapisu"), and the screen owes
 * it a sentence of its own rather than a place it did not claim.
 */
export function mealSlot(time: string | null): DietMealSlot {
  if (!time) return MEAL_SLOT_UNSPECIFIED

  const minutes = minutesOfDay(time)
  if (minutes === null) return MEAL_SLOT_UNSPECIFIED

  // Before 05:00 the loop matches nothing and the answer stays 'night', which is
  // the correct one: the night bucket wraps midnight.
  let slot: TimeOfDay = 'night'
  for (const boundary of DIET_SLOT_STARTS) {
    if (minutes >= boundary.minutes) slot = boundary.slot
  }
  return slot
}

/**
 * "raz" / "razy", for the square's second number — "wypadł w tym okresie 5 razy".
 *
 * Only two forms, and that is the whole reason the square is worded around this
 * noun rather than around "dzień". Polish numerals make the verb and the noun
 * agree with the count ("był 1 dzień", "były 3 dni", "było 5 dni"), so a
 * sentence built on "dzień" needs three forms and a teens exception for a number
 * that is only ever context. "Ten dzień tygodnia wypadł … razy" keeps the verb
 * agreeing with "dzień", which never changes, and leaves the count with the one
 * split below.
 */
export function timesPlural(count: number): string {
  return count === 1 ? 'raz' : 'razy'
}

// ---- Colour ---------------------------------------------------------------------

type Rgb = readonly [number, number, number]

/**
 * The grid's ramp: a pale sage to the brand's own `--color-sage`.
 *
 * Sage rather than the module's ochre, because §11's artboard draws this one map
 * green while everything else on the screen is ochre — and because the ochre a
 * square would have to be pale enough to start from is `--color-ochre` at low
 * opacity, which on white is not a colour anybody can see a boundary of.
 *
 * The pale end is deliberately a tint rather than near-white: it is what a
 * measured **zero** looks like, and it has to be distinguishable from the
 * outlined square next to it that means nothing was recorded at all. That
 * separation is not this file's to win on its own — measured, the pale tint and
 * the outline were 1,02:1 apart, which is no separation at all. The outline was
 * darkened instead (`.analysis-heat-cell-empty` in components/charts.css, now
 * 3,28:1 against this tint); keep the two in step if either moves.
 *
 * Never a red end. A day somebody ate at midnight is not a fault, and §15 keeps
 * red for signing out and withdrawing a consent.
 */
const MEAL_RAMP_PALE: Rgb = [193, 219, 204]
const MEAL_RAMP_DEEP: Rgb = [79, 122, 100]

function mix(from: Rgb, to: Rgb, ratio: number): string {
  const [red, green, blue] = [0, 1, 2].map((index) =>
    Math.round(from[index] + (to[index] - from[index]) * ratio),
  )
  return `rgb(${red}, ${green}, ${blue})`
}

/**
 * A square's colour, from a ratio the *caller* works out. Clamped, so a caller
 * cannot colour outside the ramp.
 *
 * **THE RATIO IS A SQUARE'S OWN WEEKDAY, NEVER THE FULLEST SQUARE ON THE GRID.**
 * `pages/DietAnalysis.tsx` divides a square's day count by that weekday's
 * `observedDays`, and the reason is the window: thirty days do not divide by
 * seven, so two weekdays occur five times in it and five occur four times.
 * Coloured against a grid-wide maximum, a patient who ate identically every
 * single day came out with two columns at full depth and five a fifth lighter —
 * and which two moved forward by one every day, so the "pattern" walked across
 * the grid while her eating did not change at all. The same arithmetic erased
 * real differences in the other direction: a breakfast on four of five Mondays
 * and on four of four Tuesdays both read 4, and drew the same colour.
 *
 * Dividing by the column's own observations is a ratio behind the scenes and
 * never on screen: the square still reads out two plain counts, and §15's ban is
 * on a fraction offered to the patient as a verdict, not on the arithmetic that
 * picks a shade. See `describeCell` in pages/DietAnalysis.tsx.
 */
export function mealDensityColor(ratio: number): string {
  return mix(MEAL_RAMP_PALE, MEAL_RAMP_DEEP, Math.min(1, Math.max(0, ratio)))
}

/** The CSS gradient the legend draws, built from the same two ends as the
 *  squares — so the legend cannot drift from the map it explains. */
export const MEAL_DENSITY_GRADIENT = `linear-gradient(to right, ${mealDensityColor(0)}, ${mealDensityColor(1)})`

// ---- The window -----------------------------------------------------------------

/** Whole calendar days from `from` to `to`. Rounded rather than truncated: both
 *  arguments are local midnights, and a DST change makes one of the days 23 or
 *  25 hours long. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** What one day of the window contributes, worked out once. */
interface DayFacts {
  weekday: number
  /** The parts of the day this day holds a meal in. A Set, because two breakfasts
   *  are one morning — the unit on this screen is days, never meals. */
  slots: Set<TimeOfDay>
  meals: number
  untimed: number
}

function factsFor(date: string, meals: DietMeal[]): DayFacts {
  const slots = new Set<TimeOfDay>()
  let untimed = 0

  for (const meal of meals) {
    const slot = mealSlot(meal.time)
    if (slot === MEAL_SLOT_UNSPECIFIED) {
      untimed += 1
      continue
    }
    slots.add(slot)
  }

  return { weekday: weekdayIndex(fromIsoDate(date)), slots, meals: meals.length, untimed }
}

function buildHeatmap(days: DayFacts[]): DietHeatmap {
  // Only days that can be placed on the grid at all. A day whose every meal was
  // saved without an hour tells the grid nothing, and counting it as "observed"
  // would turn its whole weekday from an outline into a row of measured zeroes.
  const timed = days.filter((day) => day.slots.size > 0)

  const observedByWeekday = new Map<number, number>()
  const countsByCell = new Map<string, number>()

  for (const day of timed) {
    observedByWeekday.set(day.weekday, (observedByWeekday.get(day.weekday) ?? 0) + 1)
    for (const slot of day.slots) {
      const key = `${day.weekday}:${slot}`
      countsByCell.set(key, (countsByCell.get(key) ?? 0) + 1)
    }
  }

  const cells: DietHeatmapCell[] = []

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const observedDays = observedByWeekday.get(weekday) ?? 0
    for (const slot of TIME_OF_DAY_VALUES) {
      // null only when this weekday is absent from the record entirely. With the
      // weekday observed, zero is a measurement: nothing was eaten in this part
      // of it, on the days we know about.
      const measured = observedDays === 0 ? null : (countsByCell.get(`${weekday}:${slot}`) ?? 0)
      cells.push({ weekday, slot, observedDays, days: measured })
    }
  }

  return {
    timedDays: timed.length,
    unlocked: timed.length >= DIET_HEATMAP_MIN_DAYS,
    cells,
  }
}

/** Days per part of the day, in chronological order — always four bars, because
 *  a part of the day the patient did not eat in is a measured zero and not a
 *  missing answer. */
function buildSlots(days: DayFacts[]): DietSlotShare[] {
  return TIME_OF_DAY_VALUES.map((slot) => ({
    slot,
    days: days.filter((day) => day.slots.has(slot)).length,
  }))
}

// ---- Emotions -------------------------------------------------------------------

/**
 * The column for the meals saved without a kind.
 *
 * Its own constant rather than MEAL_SLOT_UNSPECIFIED, even though the two
 * strings are identical: one names a missing *hour* and the other a missing
 * *kind*, they head different tables, and tying them together would mean a
 * change to one crossing silently moving the other. They are spelled the same
 * because they mean the same thing about the answer, not because they are the
 * same column.
 */
export const MEAL_KIND_UNSPECIFIED = 'unspecified'

/**
 * The vocabulary's own order, for breaking a tie between two emotions that came
 * up equally often and were rated the same.
 *
 * Taken from `EMOTION_COLORS`' key order, which is the app's one emotion
 * vocabulary and which `test_emotions.py` pins against `core/emotions.py`'s
 * tuple in both directions — so this breaks ties exactly the way
 * `core.diet_reports._rank_meal_emotions` breaks them on the weekly report. Two
 * screens ranking the same chips in two different orders is the kind of
 * disagreement a patient reads as a fault.
 */
const EMOTION_ORDER = new Map<string, number>(
  Object.keys(EMOTION_COLORS).map((name, index) => [name, index]),
)

/** One meal of the window, with the day it belongs to — the week crossing needs
 *  the date and the other two do not, so they travel together. */
interface WindowMeal {
  date: string
  meal: DietMeal
}

interface EmotionTally {
  meals: number
  intensities: number[]
}

/**
 * Every chip in the window, gathered by emotion.
 *
 * **AN UNRATED CHIP COUNTS TOWARDS `meals` AND NOT TOWARDS `intensities`**, and
 * that split is the whole reason this is two fields rather than a list of
 * numbers. `intensity` is null for a chip picked with the slider never moved —
 * the column is nullable precisely so it can be — and folding those in as
 * zeroes would drag an average towards the floor in proportion to how little
 * somebody filled in, which is a diary telling its owner she was calm because
 * she was in a hurry.
 */
function tallyEmotions(entries: WindowMeal[]): Map<EmotionName, EmotionTally> {
  const tallies = new Map<EmotionName, EmotionTally>()

  for (const { meal } of entries) {
    for (const rating of meal.emotions) {
      const tally = tallies.get(rating.emotion) ?? { meals: 0, intensities: [] }
      tally.meals += 1
      if (rating.intensity !== null) tally.intensities.push(rating.intensity)
      tallies.set(rating.emotion, tally)
    }
  }

  return tallies
}

/** Mean of a list, or null when it is empty — "nobody rated it" is never a zero.
 *
 *  Unrounded, like every mean `utils/analysis.ts` computes: the screen rounds at
 *  render with `formatNumber(value, 1)`, so there is one rounding rather than a
 *  stored one and a displayed one free to disagree. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * "Najczęstsze emocje przy jedzeniu" over the window.
 *
 * ORDERED BY HOW OFTEN, which is what the section is named for — and which is
 * the opposite of the psychotherapy report's ranking, where a length draws
 * intensity because *that* section is named for strength. The same reversal
 * `core.diet_reports._rank_meal_emotions` makes, for the same reason, and the
 * two have to agree: the ranking on a weekly report and the ranking here are
 * the same question asked over different stretches of time.
 *
 * Ties break on the average and then on the vocabulary's order, so the rows
 * cannot reshuffle between two renders of one window. An emotion nobody rated
 * sorts below an equally frequent one that was rated, because a null is not a
 * measurement — but it keeps its row, since being felt is what puts it there.
 */
function buildEmotionRanking(entries: WindowMeal[]): DietEmotionShare[] {
  const tallies = [...tallyEmotions(entries).entries()].map(([emotion, tally]) => ({
    emotion,
    meals: tally.meals,
    ratedMeals: tally.intensities.length,
    avgIntensity: mean(tally.intensities),
  }))

  return tallies.sort(
    (left, right) =>
      right.meals - left.meals ||
      (right.avgIntensity ?? -1) - (left.avgIntensity ?? -1) ||
      (EMOTION_ORDER.get(left.emotion) ?? EMOTION_ORDER.size) -
        (EMOTION_ORDER.get(right.emotion) ?? EMOTION_ORDER.size),
  )
}

/** What a crossing's columns are, before the meals are counted into them. */
type ColumnSpec = Pick<DietEmotionCrossColumn, 'key' | 'label' | 'hint'>

/**
 * One crossing: the ranking's emotions against a set of columns.
 *
 * `columnOf` is the only thing that differs between the three, which is why
 * they share this function rather than having one each — three near-identical
 * builders are three places for the same off-by-one to be introduced
 * independently.
 *
 * **EVERY COLUMN IS KEPT, INCLUDING THE EMPTY ONES**, and `column.meals` is
 * what lets the screen tell the two kinds of blank apart: a column holding
 * meals but no chip is a measured zero ("nothing was recorded then"), a column
 * holding no meal at all is an absence ("we know nothing about then"). Dropping
 * the second would quietly turn it into the first — the mistake
 * `DietHeatmapCell` documents at length for the map above, one table over.
 *
 * Rows are the emotions in the ranking's order, so the table reads top to
 * bottom in the same order as the bars beside it.
 */
function buildCross(
  entries: WindowMeal[],
  order: DietEmotionShare[],
  specs: ColumnSpec[],
  columnOf: (entry: WindowMeal) => string,
): DietEmotionCross {
  const mealsPerColumn = new Map<string, number>()
  // `emotion|column` — the two halves of a cell, flattened into one key so the
  // count is one lookup rather than a map of maps.
  const cellCounts = new Map<string, number>()

  for (const entry of entries) {
    const column = columnOf(entry)
    mealsPerColumn.set(column, (mealsPerColumn.get(column) ?? 0) + 1)
    for (const rating of entry.meal.emotions) {
      const key = `${rating.emotion}|${column}`
      cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1)
    }
  }

  const columns = specs.map((spec) => ({
    ...spec,
    meals: mealsPerColumn.get(spec.key) ?? 0,
  }))

  return {
    columns,
    rows: order.map((share) => ({
      emotion: share.emotion,
      meals: share.meals,
      cells: columns.map((column) => ({
        column: column.key,
        meals: cellCounts.get(`${share.emotion}|${column.key}`) ?? 0,
      })),
    })),
  }
}

/**
 * The columns of "Emocje a pora dnia".
 *
 * The four parts of the day in chronological order, and the fifth column only
 * when the window actually holds a meal without an hour — the same rule
 * `core.diet_reports._meal_grid` applies to the report's grid, and for the same
 * reason: a permanently empty "Bez godziny" column reads as a question the
 * patient failed to answer rather than as one she was never asked.
 */
function slotColumns(entries: WindowMeal[]): ColumnSpec[] {
  const columns: ColumnSpec[] = TIME_OF_DAY_VALUES.map((slot) => ({
    key: slot,
    label: TIME_OF_DAY_LABELS[slot],
  }))

  if (entries.some(({ meal }) => mealSlot(meal.time) === MEAL_SLOT_UNSPECIFIED)) {
    columns.push({ key: MEAL_SLOT_UNSPECIFIED, label: 'Bez godziny' })
  }
  return columns
}

/** The columns of "Emocje a rodzaj posiłku" — §04's six kinds in the order its
 *  picker draws them, which is also the order of a day, plus the meals saved
 *  without a kind when the window holds any. */
function kindColumns(entries: WindowMeal[]): ColumnSpec[] {
  const columns: ColumnSpec[] = MEAL_KINDS.map((kind) => ({ key: kind, label: kind }))

  if (entries.some(({ meal }) => meal.kind === null)) {
    columns.push({ key: MEAL_KIND_UNSPECIFIED, label: 'Bez rodzaju' })
  }
  return columns
}

/**
 * The columns of "Emocje w czasie": consecutive seven-day buckets from the
 * window's first day.
 *
 * NOT MONDAYS, and not the diet module's own week either. A bucket here is
 * simply seven days of the window, counted from where the window starts — which
 * rolls with the calendar, so "Tyg. 1" means a different seven days tomorrow.
 * That is the right unit for a *rolling* view and the wrong one for a report,
 * which is why `patient.diet_week_start` anchors those and nothing anchors
 * these. `buildFrequency` in utils/analysis.ts cuts its bars the same way.
 *
 * THE LAST BUCKET IS USUALLY SHORT — thirty days is four sevens and two — and
 * it is left short rather than padded, dropped or rescaled: its dates are in
 * the hint, so a column standing for two days cannot be read as a quiet week.
 */
function weekColumns(windowStart: Date, windowDays: number): ColumnSpec[] {
  const columns: ColumnSpec[] = []

  for (let offset = 0; offset < windowDays; offset += DAYS_PER_DIET_TREND_BAR) {
    const length = Math.min(DAYS_PER_DIET_TREND_BAR, windowDays - offset)
    const start = addDays(windowStart, offset)
    const end = addDays(start, length - 1)
    columns.push({
      key: toIsoDate(start),
      label: `Tyg. ${columns.length + 1}`,
      hint: rangeLabel(start, end),
    })
  }

  return columns
}

/** Which seven-day bucket a date falls in, as that bucket's key. */
function weekColumnOf(date: string, windowStart: Date): string {
  const offset = daysBetween(windowStart, fromIsoDate(date))
  const bucket = Math.floor(offset / DAYS_PER_DIET_TREND_BAR)
  return toIsoDate(addDays(windowStart, bucket * DAYS_PER_DIET_TREND_BAR))
}

/** Everything §11's emotion charts read, from the window's meals. */
function buildEmotions(entries: WindowMeal[], windowStart: Date, windowDays: number): DietEmotions {
  const ranking = buildEmotionRanking(entries)

  return {
    mealsWithEmotion: entries.filter(({ meal }) => meal.emotions.length > 0).length,
    ranking,
    byTimeOfDay: buildCross(entries, ranking, slotColumns(entries), ({ meal }) =>
      mealSlot(meal.time),
    ),
    byKind: buildCross(entries, ranking, kindColumns(entries), ({ meal }) =>
      meal.kind ?? MEAL_KIND_UNSPECIFIED,
    ),
    byWeek: buildCross(entries, ranking, weekColumns(windowStart, windowDays), ({ date }) =>
      weekColumnOf(date, windowStart),
    ),
  }
}

/**
 * Everything the diet "Analiza" screen draws, from the history the archive
 * already loads.
 *
 * `today` is passed in rather than read here so the whole screen can be tested
 * against a fixed calendar — the same reason `core/diet_reports.py` takes its
 * cutoff as an argument.
 *
 * Returns null only when the patient has never saved a meal; the screen shows its
 * own empty state for that. An account with meals but none inside the window is
 * *not* null — it gets an analysis with `daysWithMeal: 0`, because "nothing in
 * the last thirty days" and "nothing ever" are different things to say and the
 * screen says them differently.
 */
export function buildDietAnalysis(
  history: DietJournalDay[],
  today: Date,
): DietAnalysis | null {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayIso = toIsoDate(todayMidnight)

  // ISO dates compare correctly as strings, which is why the API uses them. A
  // day carrying no meal cannot reach this screen through `/api/diet/meals/`
  // (the server lists exactly the days that hold one), but it is dropped anyway
  // rather than trusted: it would otherwise anchor the window to a day with
  // nothing in it.
  const past = history.filter((day) => day.date <= todayIso && day.meals.length > 0)
  if (past.length === 0) return null

  const firstIso = past.reduce(
    (earliest, day) => (day.date < earliest ? day.date : earliest),
    past[0].date,
  )

  // The rolling window: as long as the account's history, up to the ceiling.
  // Recomputed on every visit, so it moves with the calendar rather than
  // resetting in blocks.
  const windowDays = Math.min(
    DIET_ANALYSIS_WINDOW_DAYS,
    daysBetween(fromIsoDate(firstIso), todayMidnight) + 1,
  )
  const windowStart = addDays(todayMidnight, -(windowDays - 1))
  const windowStartIso = toIsoDate(windowStart)

  /**
   * One entry per calendar day.
   *
   * `core/meals.load_history` groups by `entry_date` before sending, so a second
   * row for a day should not arrive — but nothing in the shape enforces it, and
   * a duplicate is not harmless here: the day would be counted twice towards a
   * square and towards a bar while the day itself is still one day. Merged
   * rather than deduplicated, because two rows for one date would each hold part
   * of the meals.
   */
  const mealsByDate = new Map<string, DietMeal[]>()
  for (const day of past) {
    if (day.date < windowStartIso) continue
    mealsByDate.set(day.date, [...(mealsByDate.get(day.date) ?? []), ...day.meals])
  }

  const days = [...mealsByDate.entries()].map(([date, meals]) => factsFor(date, meals))

  /* The same meals, flat and carrying their day.
   *
   * The charts above count *days* — two breakfasts on one Tuesday are one
   * Tuesday morning — and the emotion charts count *meals*, because an emotion
   * belongs to a meal and two difficult meals on one day are two things that
   * happened. So they cannot read the same `DayFacts`, and this is the one
   * extra pass that difference costs. */
  const windowMeals: WindowMeal[] = [...mealsByDate.entries()].flatMap(([date, meals]) =>
    meals.map((meal) => ({ date, meal })),
  )

  return {
    window: {
      days: windowDays,
      startDate: windowStartIso,
      endDate: todayIso,
      daysWithMeal: days.length,
      mealCount: days.reduce((total, day) => total + day.meals, 0),
    },
    heatmap: buildHeatmap(days),
    slots: buildSlots(days),
    untimedMeals: days.reduce((total, day) => total + day.untimed, 0),
    emotions: buildEmotions(windowMeals, windowStart, windowDays),
  }
}
