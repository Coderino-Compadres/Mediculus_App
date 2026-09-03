import type { EmotionName } from '../utils/emotions'
import type { TimeOfDay } from '../utils/timeOfDay'

/**
 * The "Analiza" screen's shape — deliberately not a report.
 *
 * A weekly report (types/report.ts) is a slice of one Monday-Sunday week: fixed
 * boundaries, generated once, archived, exported to PDF for a specialist. It
 * answers "how was this week".
 *
 * An analysis is a continuous view over a longer, *rolling* stretch of history,
 * recomputed every time the screen opens and never stored. It answers "when and
 * in what situations do I tend to have a harder time". That is why there is no
 * id here, no range label to archive under, no delta against a previous period
 * and no export — none of those are properties of something that has no
 * boundaries to begin with.
 */

/**
 * The stretch of days the analysis covers.
 *
 * Rolling, recomputed daily — not a block that resets every 30 days. It grows
 * with the account: `days` is min(ANALYSIS_WINDOW_DAYS, days since the first
 * entry), so somebody 23 days in gets an analysis of 23 days rather than an
 * analysis of 30 days that is two thirds empty. Every caption on the screen has
 * to state this number rather than saying "30 dni".
 */
export interface AnalysisWindow {
  /** min(ANALYSIS_WINDOW_DAYS, days since the first entry), counted inclusively. */
  days: number
  /** ISO date of the window's first day. */
  startDate: string
  /** ISO date of its last day, i.e. today. */
  endDate: string
  /** How many of those days hold an entry. */
  entryCount: number
}

/**
 * One day on the line chart.
 *
 * Every answer the chart can draw, in the unit the patient gave it — the 1-5
 * mood tiles stay 1-5 here and the sliders stay 0-10. Normalizing onto the
 * chart's shared 0-10 axis is the chart's job (see `components/TrendChart.tsx`),
 * not this layer's: a point that already carried a scaled number would be
 * unreadable next to the entry it came from.
 *
 * null (or a missing emotion key) means the day was never rated on that
 * question — never a zero. The chart breaks its line there rather than
 * interpolating a value the patient never gave.
 */
export interface TrendPoint {
  date: string
  /** '27.08' — the x-axis tick. */
  dayLabel: string
  /** 1-5 (MOOD_RANK); null when the day has no entry or skipped the mood tiles. */
  mood: number | null
  /** The 0-10 energy slider. */
  energy: number | null
  /** The 0-10 tension slider. */
  tension: number | null
  /**
   * The 0-10 intensity of each emotion the day actually rated, keyed by name.
   *
   * A missing key is "not rated", which is why this is a partial record rather
   * than ten nullable fields. 'Stres' lives in here like the other nine — it is
   * one of the ten emotions (utils/emotions.ts), stored on the diary row only
   * because the form puts an alert threshold on it, and giving it a field of its
   * own here would mean two places to read one number from.
   */
  emotions: Partial<Record<EmotionName, number>>
}

/** One bar of "Udział emocji". */
export interface EmotionShare {
  emotion: EmotionName
  /** Days in the window on which the entry rated this emotion. */
  days: number
  /** From utils/emotions.ts — the one palette, never a second one. */
  color: string
}

/** One cell of the "Kiedy jest trudniej" grid: a weekday crossed with a part of the day. */
export interface HeatmapCell {
  /** 0 = Monday, matching utils/days.ts `startOfWeek`. */
  weekday: number
  timeOfDay: TimeOfDay
  /** Rated entries that landed in this cell — 0 is a normal, uncoloured cell.
   *  An entry that named a part of the day and rated nothing is not counted:
   *  there would be no value to colour the cell with. */
  entries: number
  /** Mean difficulty 0-10 across those entries; null when there are none. */
  difficulty: number | null
}

export interface AnalysisHeatmap {
  /**
   * Days in the window whose entry answered "pora dnia" *and* rated something
   * the map can colour a cell with.
   *
   * Counted rather than the plain entry count on purpose: 14 entries of which 3
   * name a part of the day would unlock a grid drawn from three points. The
   * second half of the condition matters for the same reason — 14 days that
   * name a part of the day and rate nothing would unlock a grid of 28 empty
   * squares.
   */
  ratedDays: number
  /** False until `ratedDays` reaches HEATMAP_MIN_DAYS — the grid stays hidden. */
  unlocked: boolean
  /** Always 7 × 4 cells, in weekday-then-part-of-day order. */
  cells: HeatmapCell[]
}

/**
 * Which stretch "Częstotliwość wpisów" covers, and how it cuts that stretch up.
 *
 * The section has a period of its own rather than following the rest of the
 * screen: everything else answers "what is going on with me lately" and is
 * deliberately capped at ANALYSIS_WINDOW_DAYS, while this one answers "am I
 * keeping this up", which is a question about the long run. It is now the *only*
 * section with a range of its own — the line chart used to be a third window and
 * follows the screen's since — which is why its subtitle names the bucket.
 *
 * The bucket grows with the range on purpose, which is what keeps the bar count
 * near a dozen at every setting -- a year cut into weeks would be 52 bars, and
 * that is the shape the patient asked pagination for. Nothing needs paging when
 * the chart is never longer than twelve bars.
 */
export type FrequencyPeriodId = '30d' | '90d'

/**
 * What "Częstotliwość wpisów" is currently showing.
 *
 * Two kinds, because they come from two places and cannot be one id. A rolling
 * range is computed in the browser out of the entry list the screen already
 * holds; a named year is fetched, because `/api/diary/` stops at its newest
 * 1000 rows and a patient asking in 2031 about 2026 is asking about entries the
 * browser is never sent. Drawing that year from what did arrive would render as
 * a flat "you did not write" — a false statement about somebody's own history.
 */
export type FrequencySelection =
  | { kind: 'rolling'; id: FrequencyPeriodId }
  | { kind: 'year'; year: number }

/** What `GET /api/analysis/frequency/` answers with, already mapped. */
export interface YearFrequency {
  year: number
  /** Every year the patient has an entry in, oldest first — the picker's options.
   *  From the database rather than from the loaded entries, for the cap above. */
  yearsWithEntries: number[]
  buckets: FrequencyBucket[]
}

/** One bar of "Częstotliwość wpisów". */
export interface FrequencyBucket {
  /** 'Tyg. 1' for a week, 'sie' for a month. Oldest first. */
  label: string
  /** Days in this stretch that hold an entry. */
  days: number
  /** How many calendar days the stretch covers. */
  length: number
  /**
   * True when the stretch is shorter than a whole week/month.
   *
   * The newest bucket almost always is (the week or month is still running) and
   * the oldest one can be, on an account younger than the period. The screen
   * says so under the bar: 2 out of 2 days drawn at full height next to 7 out of
   * 7 is honest, but "Tyg. 5" at two sevenths would read as somebody who nearly
   * stopped writing. Decided here, where the full length is known, rather than
   * left to the page to infer from `length`.
   */
  partial: boolean
  /** '3 – 9 sierpnia', for the bar's tooltip. */
  rangeLabel: string
}

/** The four cards under the line chart. Every field is nullable: each is a
 *  reading the patient may simply not have given enough answers for. */
export interface AnalysisSummary {
  topEmotion: EmotionShare | null
  /** Mean of MOOD_RANK over the days that answered the mood tiles, on the 1-5 scale. */
  averageMood: number | null
  /** 0 = Monday; null when nothing in the window carries a difficulty reading. */
  hardestWeekday: number | null
  /** null both when nothing was rated and while the heatmap is still locked —
   *  the card must not state from four entries what the grid refuses to draw. */
  hardestTimeOfDay: TimeOfDay | null
}

/** The "Co z tego wynika" paragraph. */
export interface AnalysisInsight {
  text: string
  /**
   * True while there is too little history to state a pattern, which the wording
   * then says out loud.
   *
   * This is a mental-health app: a confident sentence about "your Monday
   * evenings" drawn from two Mondays is a conclusion the patient may carry
   * around, and we are not entitled to hand them one.
   */
  tentative: boolean
}

export interface Analysis {
  window: AnalysisWindow
  /** One point per day of `window`, oldest first — the same stretch as the rest
   *  of the screen. Days with no entry are present, as points with nothing
   *  rated: the x-axis is a calendar. */
  trend: TrendPoint[]
  summary: AnalysisSummary
  heatmap: AnalysisHeatmap
  /** Only emotions actually rated in the window, most days first. */
  emotions: EmotionShare[]
  /** Not here: "Częstotliwość wpisów" reads a period of its own, chosen on the
   *  screen, and reaches further back than this window -- see `buildFrequency`. */
  insight: AnalysisInsight
}
