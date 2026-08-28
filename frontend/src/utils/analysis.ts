/**
 * The aggregation behind the "Analiza" screen.
 *
 * Pure functions over the entries `GET /api/diary/` already answers with — the
 * same call "Dzienniczki" makes (`fetchJournalEntries`), so a number on this
 * screen cannot disagree with the entry it came from. Kept out of the page for
 * the same reason `core/dashboard.py` is kept out of its view: this is where the
 * judgements live, and they have to be testable without mounting a screen.
 *
 * Nothing here reaches the network and nothing is stored. An analysis is
 * recomputed on every visit, which is what makes the window able to roll.
 */

import { addDays, fromIsoDate, toIsoDate } from './days'
import { EMOTION_COLORS, STRES, type EmotionName } from './emotions'
import { MOOD_RANK } from './moods'
import { LEVEL_SCALE_MAX } from './reports'
import { TIME_OF_DAY_VALUES, type TimeOfDay } from './timeOfDay'
import type { JournalListEntry } from '../types/diaryEntry'
import type {
  Analysis,
  AnalysisHeatmap,
  AnalysisInsight,
  AnalysisSummary,
  EmotionShare,
  HeatmapCell,
  TrendPoint,
  WeekFrequency,
} from '../types/analysis'

/** The rolling window's ceiling. Until an account is this old the window is
 *  simply as long as the account's history — see `buildAnalysis`. */
export const ANALYSIS_WINDOW_DAYS = 30

/**
 * The line chart is capped shorter than the rest of the screen, on purpose.
 *
 * Thirty points across a phone's width is a few pixels per day: the line stops
 * being readable as a shape and starts being a texture. Fourteen days still
 * shows the swing between one week and the next, which is what the chart is for.
 * The cards, the heat map and both bar charts keep the full window — they are
 * summaries, and more days only makes them steadier.
 *
 * This is a deliberate design decision, not an oversight or an off-by-window bug.
 */
export const TREND_CHART_MAX_DAYS = 14

/**
 * How many days must carry a "pora dnia" before the heat map is drawn at all.
 *
 * The grid is 7 × 4 cells. At a handful of days most of them are empty and the
 * few that are filled hold exactly one entry each — so a single bad Monday
 * evening renders as a solid "your Monday evenings are the hard ones", and the
 * patient may well believe it. That is a false conclusion about their own
 * emotional pattern, produced by us, in a mental-health app. Below this
 * threshold the section says it is still collecting instead.
 *
 * It counts days that answered the *pora dnia* question specifically, not days
 * with any entry: the field is optional, so 14 entries of which 3 name a part of
 * the day would otherwise unlock a map drawn from three points.
 *
 * One constant, read everywhere the threshold matters (the grid, the "Trudna
 * pora dnia" card, the tone of the closing paragraph) — change it here.
 */
export const HEATMAP_MIN_DAYS = 14

/**
 * How many rated days a weekday (or a part of the day) needs before the screen
 * is willing to call it the hard one.
 *
 * "Trudniej bywa Ci we wtorki" is a claim about a recurring pattern — *bywa*,
 * habitually — and one Tuesday cannot support it. Two is the floor at which the
 * sentence stops being a report of a single day, which matters most in exactly
 * the case the plain entry count misses: 14 entries spread over 30 days leaves
 * several weekdays holding one apiece.
 */
export const MIN_DAYS_PER_GROUP = 2

/**
 * How much harder than an ordinary day a group has to be before it is named,
 * on the 0-10 difficulty scale.
 *
 * Without it a uniformly calm month still produces a winner — every weekday
 * within a rounding error of the others, and the tie-break hands the patient
 * "trudniej bywa Ci w poniedziałki" about a month in which nothing was hard.
 * A tenth of the scale is the smallest gap worth calling a pattern.
 */
export const MIN_DIFFICULTY_MARGIN = 1

/** The mood tiles are a 1-5 scale (utils/moods.ts); the sliders and chips are 0-10. */
export const MOOD_SCALE_MAX = 5

/** Days per bar on "Częstotliwość wpisów". */
const DAYS_PER_WEEK_BAR = 7

/**
 * Monday-first, like `startOfWeek` in utils/days.ts and the weekly reports —
 * the Polish week.
 *
 * `phrase` is a fixed sentence fragment rather than something declined at
 * runtime: Polish weekday forms do not fall out of a `toLocaleDateString`, and
 * the closing paragraph has to read like a sentence somebody wrote.
 */
export const WEEKDAYS = [
  { short: 'Pn', full: 'Poniedziałek', phrase: 'w poniedziałki' },
  { short: 'Wt', full: 'Wtorek', phrase: 'we wtorki' },
  { short: 'Śr', full: 'Środa', phrase: 'w środy' },
  { short: 'Cz', full: 'Czwartek', phrase: 'w czwartki' },
  { short: 'Pt', full: 'Piątek', phrase: 'w piątki' },
  { short: 'So', full: 'Sobota', phrase: 'w soboty' },
  { short: 'Nd', full: 'Niedziela', phrase: 'w niedziele' },
] as const

/** The same fixed-fragment trick for the four parts of the day. The labels
 *  themselves stay in utils/timeOfDay.ts — these are only their adverbial forms. */
const TIME_OF_DAY_PHRASES: Record<TimeOfDay, string> = {
  morning: 'rano',
  noon: 'w południe',
  evening: 'wieczorem',
  night: 'w nocy',
}

/**
 * The genitive of "wpis", for the caption's "wyliczone **z** N wpisów".
 *
 * Genitive rather than the nominative 1/2-4/5+ pattern, because the preposition
 * governs it: "z 3 wpisów", not "z 3 wpisy". That collapses every count above
 * one onto a single form, and only the singular differs.
 */
export function entriesGenitive(count: number): string {
  return count === 1 ? 'wpisu' : 'wpisów'
}

/**
 * The same for "dzień", wherever a preposition governs it — "z 1 dnia", "z 7
 * dni", never `pluralDays`' nominative "z 1 dzień".
 *
 * Kept apart from `pluralDays` in utils/reports.ts rather than replacing it:
 * that one is right where the count stands on its own ("Lęk — 1 dzień"), and
 * this one where something in front of it asks for the genitive.
 */
export function daysGenitive(count: number): string {
  return count === 1 ? 'dnia' : 'dni'
}

/** Whole calendar days from `from` to `to`. Rounded rather than truncated: both
 *  arguments are local midnights, and a DST change makes one of the days 23 or
 *  25 hours long. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** Monday-first weekday index of a local date — 0 is Monday, matching WEEKDAYS. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** The 'Stres' chip's 0-10 rating, or null when the entry did not rate it.
 *
 * Stress is read off the emotion picker rather than a slider of its own — it is
 * one of the ten emotions (and lands in `diary.stress_level`), which is exactly
 * what STRES in utils/emotions.ts exists to say. */
export function stressLevel(entry: JournalListEntry): number | null {
  return entry.emotions.find((rating) => rating.emotion === STRES)?.intensity ?? null
}

/**
 * How hard one day was, on a 0-10 scale where 10 is the hardest.
 *
 * The average of whichever of four answers the entry actually gave: the mood
 * tiles (inverted onto 0-10), the 'Stres' rating, the tension slider, and the
 * energy slider (inverted). Nothing else on the form has a direction that this
 * app already asserts — the same four the weekly report is willing to tone, and
 * for the same reason: the mood tiles are ordered, and the sliders are labelled
 * *wyczerpanie ↔ pełnia energii* / *rozluźnienie ↔ skrajne napięcie*. An emotion
 * chip is not in here, because whether more 'Lęk' is worse is a clinical
 * judgement this screen is not entitled to make.
 *
 * Averaged over the answers given rather than over all four, so skipping a
 * slider is not read as a zero on it. null when the entry answered none of them
 * — a day with only free text is not a calm day, it is an unrated one, and it
 * stays out of every difficulty figure on the screen.
 */
export function difficultyScore(entry: JournalListEntry): number | null {
  const parts: number[] = []

  if (entry.mood) {
    // 1-5 where 5 is best → 0-10 where 10 is hardest.
    parts.push(((MOOD_SCALE_MAX - MOOD_RANK[entry.mood]) / (MOOD_SCALE_MAX - 1)) * LEVEL_SCALE_MAX)
  }
  const stress = stressLevel(entry)
  if (stress !== null) parts.push(stress)
  if (entry.tensionLevel !== null) parts.push(entry.tensionLevel)
  if (entry.energyLevel !== null) parts.push(LEVEL_SCALE_MAX - entry.energyLevel)

  if (parts.length === 0) return null
  return parts.reduce((sum, part) => sum + part, 0) / parts.length
}

/** Mean of a list, or null when it is empty — "no answers" is never a zero here. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

// ---- Colour ---------------------------------------------------------------------

type Rgb = [number, number, number]

/**
 * The heat map's ramp, in the brand's own colours: a pale sage for the easier
 * end, through the entry form's ochre, to the terracotta that already means
 * "harder" on the mood tiles (utils/moods.ts) and the stress line.
 *
 * Never the error red: a difficult day is not a fault, and the app says so
 * everywhere else it draws one.
 */
const DIFFICULTY_RAMP: { at: number; color: Rgb }[] = [
  { at: 0, color: [219, 234, 223] },
  { at: 0.5, color: [231, 198, 135] },
  { at: 1, color: [217, 119, 106] },
]

function css([red, green, blue]: Rgb): string {
  return `rgb(${red}, ${green}, ${blue})`
}

function mix(from: Rgb, to: Rgb, ratio: number): Rgb {
  return [0, 1, 2].map((index) =>
    Math.round(from[index] + (to[index] - from[index]) * ratio),
  ) as Rgb
}

/** A 0-10 difficulty as a colour on the ramp above. Used by the grid cells and,
 *  through DIFFICULTY_GRADIENT, by the legend under them — so the legend cannot
 *  drift from the map it explains. */
export function difficultyColor(score: number): string {
  const position = Math.min(1, Math.max(0, score / LEVEL_SCALE_MAX))
  const last = DIFFICULTY_RAMP[DIFFICULTY_RAMP.length - 1]

  for (let index = 1; index < DIFFICULTY_RAMP.length; index += 1) {
    const previous = DIFFICULTY_RAMP[index - 1]
    const next = DIFFICULTY_RAMP[index]
    if (position > next.at) continue
    const span = next.at - previous.at
    return css(mix(previous.color, next.color, span === 0 ? 0 : (position - previous.at) / span))
  }

  return css(last.color)
}

/** The CSS gradient the legend draws, built from the same ramp as the cells. */
export const DIFFICULTY_GRADIENT = `linear-gradient(to right, ${DIFFICULTY_RAMP.map(
  (stop) => `${css(stop.color)} ${stop.at * 100}%`,
).join(', ')})`

const SAGE_LIGHT: Rgb = [127, 169, 143]
const SAGE_DEEP: Rgb = [79, 122, 100]

/** A shade of the brand sage, deeper the fuller the bar — for "Częstotliwość
 *  wpisów", which has no palette of its own and must not borrow one that means
 *  an emotion somewhere else. */
export function sageShade(ratio: number): string {
  return css(mix(SAGE_LIGHT, SAGE_DEEP, Math.min(1, Math.max(0, ratio))))
}

// ---- The window -----------------------------------------------------------------

/** '3 – 9 sierpnia', for a week bar's tooltip. */
function rangeLabel(start: Date, end: Date): string {
  const day = (date: Date) => date.toLocaleDateString('pl-PL', { day: 'numeric' })
  const full = (date: Date) => date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
  return start.getMonth() === end.getMonth() ? `${day(start)} – ${full(end)}` : `${full(start)} – ${full(end)}`
}

// ---- Sections -------------------------------------------------------------------

/**
 * One point per calendar day of the (shorter) trend window, oldest first.
 *
 * Days with no entry are present as points with two nulls rather than left out:
 * the x-axis is a calendar, so dropping them would silently close the gap and
 * draw a straight line across a week nobody wrote in.
 */
function buildTrend(byDate: Map<string, JournalListEntry>, today: Date, windowDays: number): TrendPoint[] {
  const days = Math.min(TREND_CHART_MAX_DAYS, windowDays)
  const points: TrendPoint[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset)
    const iso = toIsoDate(date)
    const entry = byDate.get(iso)
    points.push({
      date: iso,
      dayLabel: date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
      mood: entry?.mood ? MOOD_RANK[entry.mood] : null,
      stress: entry ? stressLevel(entry) : null,
    })
  }

  return points
}

/** Days per emotion, most days first. Ties fall back to the declaration order in
 *  utils/emotions.ts, the same tie-break the weekly report uses. */
function buildEmotions(entries: JournalListEntry[]): EmotionShare[] {
  const order = Object.keys(EMOTION_COLORS) as EmotionName[]
  const days = new Map<EmotionName, number>()

  for (const entry of entries) {
    // A Set, because one entry is one day however many chips it carries.
    for (const emotion of new Set(entry.emotions.map((rating) => rating.emotion))) {
      // `Object.hasOwn`, not `in`: api/diary.ts casts the API's emotion name to
      // EmotionName without checking it, so `in` would also answer true for
      // 'toString' and hand a function to `style.backgroundColor`. The same
      // guard, for the same reason, as `isTimeOfDay` in utils/timeOfDay.ts.
      if (!Object.hasOwn(EMOTION_COLORS, emotion)) continue
      days.set(emotion, (days.get(emotion) ?? 0) + 1)
    }
  }

  return [...days.entries()]
    .map(([emotion, count]): EmotionShare => ({
      emotion,
      days: count,
      color: EMOTION_COLORS[emotion],
    }))
    .sort((a, b) => b.days - a.days || order.indexOf(a.emotion) - order.indexOf(b.emotion))
}

/** The 7 × 4 grid, plus the count that decides whether it may be shown at all. */
function buildHeatmap(entries: JournalListEntry[]): AnalysisHeatmap {
  const buckets = new Map<string, number[]>()
  let ratedDays = 0

  for (const entry of entries) {
    // No part of the day means no cell. The field is optional, so this is a
    // normal answer rather than a gap to fill in — guessing one from `savedAt`
    // would put the moment the patient pressed "Zapisz" on a map of when things
    // happened to them, which are not the same question.
    if (!entry.timeOfDay) continue
    const score = difficultyScore(entry)
    // Counted after the score, not before: a day that names a part of the day
    // and rates nothing colours no cell, so counting it would unlock a grid of
    // 28 empty squares — a worse answer than the "still collecting" message it
    // replaced. Slightly stricter than "days with a pora dnia", deliberately.
    if (score === null) continue
    ratedDays += 1
    const key = `${weekdayIndex(fromIsoDate(entry.date))}:${entry.timeOfDay}`
    buckets.set(key, [...(buckets.get(key) ?? []), score])
  }

  const cells: HeatmapCell[] = []
  for (let weekday = 0; weekday < WEEKDAYS.length; weekday += 1) {
    for (const timeOfDay of TIME_OF_DAY_VALUES) {
      const scores = buckets.get(`${weekday}:${timeOfDay}`) ?? []
      cells.push({ weekday, timeOfDay, entries: scores.length, difficulty: mean(scores) })
    }
  }

  return { ratedDays, unlocked: ratedDays >= HEATMAP_MIN_DAYS, cells }
}

/**
 * One bar per seven days of the window, oldest first.
 *
 * Anchored at the window's start, so "Tyg. 1" is always a full week and it is
 * the last bar — the stretch still in progress — that may cover fewer days. Its
 * length travels with it so the screen can say so rather than letting a short
 * week read as a week somebody stopped writing in.
 */
function buildWeeks(dates: Set<string>, windowStart: Date, windowDays: number): WeekFrequency[] {
  const weeks: WeekFrequency[] = []

  for (let offset = 0; offset < windowDays; offset += DAYS_PER_WEEK_BAR) {
    const length = Math.min(DAYS_PER_WEEK_BAR, windowDays - offset)
    const start = addDays(windowStart, offset)
    const end = addDays(start, length - 1)
    let days = 0
    for (let step = 0; step < length; step += 1) {
      if (dates.has(toIsoDate(addDays(start, step)))) days += 1
    }
    weeks.push({
      label: `Tyg. ${weeks.length + 1}`,
      days,
      length,
      rangeLabel: rangeLabel(start, end),
    })
  }

  return weeks
}

function buildSummary(
  entries: JournalListEntry[],
  emotions: EmotionShare[],
  heatmap: AnalysisHeatmap,
): AnalysisSummary {
  const moods = entries.flatMap((entry) => (entry.mood ? [MOOD_RANK[entry.mood]] : []))

  const byWeekday = new Map<number, number[]>()
  const byTimeOfDay = new Map<TimeOfDay, number[]>()

  for (const entry of entries) {
    const score = difficultyScore(entry)
    if (score === null) continue
    const weekday = weekdayIndex(fromIsoDate(entry.date))
    byWeekday.set(weekday, [...(byWeekday.get(weekday) ?? []), score])
    if (entry.timeOfDay) {
      byTimeOfDay.set(entry.timeOfDay, [...(byTimeOfDay.get(entry.timeOfDay) ?? []), score])
    }
  }

  // What an ordinary rated day in this window looks like, so "hardest" can be
  // measured against it rather than only against the other groups.
  const baseline = mean([...byWeekday.values()].flat())

  /**
   * The hardest group, or null when naming one would not be supportable.
   *
   * Three ways to answer null, and every one of them is the point:
   *   - nothing in the group was rated at all;
   *   - the winner rests on fewer than MIN_DAYS_PER_GROUP days, so it describes
   *     one bad Tuesday rather than Tuesdays;
   *   - the winner is not MIN_DIFFICULTY_MARGIN harder than an ordinary day, so
   *     there is no pattern here — only a tie-break, which would otherwise hand
   *     a patient who had a calm month a sentence about their hard Mondays.
   *
   * Ties among qualifying groups still go to the earlier key, so the answer
   * never depends on Map insertion order.
   */
  function hardest<Key>(groups: Map<Key, number[]>, order: readonly Key[]): Key | null {
    if (baseline === null) return null

    let best: { key: Key; score: number } | null = null
    for (const key of order) {
      const scores = groups.get(key) ?? []
      if (scores.length < MIN_DAYS_PER_GROUP) continue
      const score = mean(scores)
      if (score === null) continue
      if (best === null || score > best.score) best = { key, score }
    }

    if (best === null || best.score - baseline < MIN_DIFFICULTY_MARGIN) return null
    return best.key
  }

  return {
    topEmotion: emotions[0] ?? null,
    averageMood: mean(moods),
    // The card and the closing paragraph both read this, so the guard sits here
    // rather than in either of them — one definition of "we can say this".
    hardestWeekday: hardest(
      byWeekday,
      WEEKDAYS.map((_, index) => index),
    ),
    // Plus the grid's own threshold: naming "Wieczór" as the hard part of the
    // week off four answers is exactly the unfounded conclusion the locked map
    // exists to avoid, and the card must not state what the map declines to
    // draw. A dash says "not enough answers yet".
    hardestTimeOfDay: heatmap.unlocked ? hardest(byTimeOfDay, TIME_OF_DAY_VALUES) : null,
  }
}

/**
 * The "Co z tego wynika" paragraph — the rule from the mockup: a conclusion
 * rather than another number, so the charts above do not end up meaning nothing.
 *
 * Placeholder wording for now, but the *shape* is not a placeholder: what it is
 * willing to claim scales with how much history is behind it, and it never
 * states more than the sections above it were prepared to draw.
 *
 * TODO: an insight about which techniques actually helped ("nastrój był średnio
 * o 0,8 wyższy w dni, w których zastosowałaś technikę oddechową") belongs here
 * and is deliberately absent — rating a technique after applying it does not
 * exist anywhere in the app yet (`raport.technique_efficiency` is the column
 * waiting for it), so the number would be invented. Everything this function
 * says comes from the diary: emotions, mood, levels, parts of the day, weekdays
 * and triggers.
 */
function buildInsight(summary: AnalysisSummary, entryCount: number): AnalysisInsight {
  if (entryCount < HEATMAP_MIN_DAYS) {
    return {
      tentative: true,
      text: 'Za wcześnie na wyraźne wzorce — zbieramy dane z Twoich wpisów. Im więcej dni zapiszesz, tym pewniej będzie tu widać, kiedy bywa Ci trudniej.',
    }
  }

  // Null here is now two different things — too few rated days to lean on, or
  // enough of them and no day standing out — so the wording has to be true of
  // both. "Nie widać wyraźnego wzorca" is, and it is also not bad news.
  if (summary.hardestWeekday === null) {
    return {
      tentative: true,
      text: 'Na razie nie widać wyraźnego wzorca — żaden dzień tygodnia nie odstaje wyraźnie od pozostałych. To też jest informacja. Oceny nastroju, napięcia i energii przy wpisach pomagają ten obraz wyostrzyć.',
    }
  }

  const when = summary.hardestTimeOfDay
    ? `${WEEKDAYS[summary.hardestWeekday].phrase}, zwłaszcza ${TIME_OF_DAY_PHRASES[summary.hardestTimeOfDay]}`
    : WEEKDAYS[summary.hardestWeekday].phrase

  const emotion = summary.topEmotion
    ? ` W tym okresie najczęściej wracała jedna emocja: ${summary.topEmotion.emotion.toLowerCase()}.`
    : ''

  return { tentative: false, text: `Trudniej bywa Ci ${when}.${emotion}` }
}

// ---- Entry point ----------------------------------------------------------------

/**
 * Everything the "Analiza" screen draws, from the entries the archive already
 * loaded.
 *
 * `today` is passed in rather than read here so the whole screen can be tested
 * against a fixed calendar — the same reason `core/reports.py` takes its cutoff
 * as an argument.
 *
 * Returns null only when the patient has never written an entry; the screen
 * shows its empty state for that. An account with entries but none inside the
 * window is *not* null — it gets an analysis with `entryCount: 0`, because
 * "nothing in the last 30 days" and "nothing ever" are different things to say.
 */
export function buildAnalysis(entries: JournalListEntry[], today: Date): Analysis | null {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayIso = toIsoDate(todayMidnight)

  // ISO dates compare correctly as strings, which is why the API uses them.
  const past = entries.filter((entry) => entry.date <= todayIso)
  if (past.length === 0) return null

  const firstIso = past.reduce((earliest, entry) => (entry.date < earliest ? entry.date : earliest), past[0].date)

  // The rolling window: as long as the account's history, up to the ceiling.
  // Recomputed on every visit, so it moves with the calendar rather than
  // resetting in blocks.
  const windowDays = Math.min(ANALYSIS_WINDOW_DAYS, daysBetween(fromIsoDate(firstIso), todayMidnight) + 1)
  const windowStart = addDays(todayMidnight, -(windowDays - 1))
  const windowStartIso = toIsoDate(windowStart)

  const inWindow = past.filter((entry) => entry.date >= windowStartIso)

  /**
   * One entry per calendar day.
   *
   * That is the product rule (core/diary.py), but nothing in the schema enforces
   * it, and a second row for a day is not harmless: the raw list would count it
   * twice towards an emotion's days and towards the heat map, while the day
   * itself is still one day.
   *
   * The first occurrence wins, because `GET /api/diary/` orders by `created_at`
   * descending (core/diary.py `load_history`) — so the survivor is the same row
   * `/api/diary/today/` edits and the home dashboard reads, and the two screens
   * cannot end up describing the same day differently. Everything below reads
   * this, never `inWindow`.
   */
  const byDate = new Map<string, JournalListEntry>()
  for (const entry of inWindow) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, entry)
  }
  const days = [...byDate.values()]

  const emotions = buildEmotions(days)
  const heatmap = buildHeatmap(days)
  const summary = buildSummary(days, emotions, heatmap)

  return {
    window: {
      days: windowDays,
      startDate: windowStartIso,
      endDate: todayIso,
      entryCount: byDate.size,
    },
    trend: buildTrend(byDate, todayMidnight, windowDays),
    summary,
    heatmap,
    emotions,
    weeks: buildWeeks(new Set(byDate.keys()), windowStart, windowDays),
    insight: buildInsight(summary, byDate.size),
  }
}
