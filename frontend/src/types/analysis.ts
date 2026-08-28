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

/** One day on the mood/stress line chart. */
export interface TrendPoint {
  date: string
  /** '27.08' — the x-axis tick. */
  dayLabel: string
  /** 1-5 (MOOD_RANK); null when the day has no entry or skipped the mood tiles. */
  mood: number | null
  /** The 0-10 'Stres' rating; null when the day has no entry or never rated it. */
  stress: number | null
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

/** One bar of "Częstotliwość wpisów". */
export interface WeekFrequency {
  /** 'Tyg. 1', oldest first. */
  label: string
  /** Days in this stretch that hold an entry. */
  days: number
  /** How many calendar days the stretch covers — the last one may be shorter than 7. */
  length: number
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
  /** At most TREND_CHART_MAX_DAYS days — a shorter window than the rest of the screen. */
  trend: TrendPoint[]
  summary: AnalysisSummary
  heatmap: AnalysisHeatmap
  /** Only emotions actually rated in the window, most days first. */
  emotions: EmotionShare[]
  weeks: WeekFrequency[]
  insight: AnalysisInsight
}
