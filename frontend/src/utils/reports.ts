/**
 * Turning diary entries into weekly reports.
 *
 * Reports are generated automatically, once a week, and diary entries are their
 * only source — both confirmed with the client. Which means everything on the
 * "Raporty" screens is *derived* here rather than stored: nothing on those
 * screens can disagree with the diary, and the numbers match what "Dzienniczki"
 * shows for the same days because both read the same entries.
 *
 * The week runs Monday to Sunday, and only weeks that have already ended get a
 * report — a partial week is not something the app would have generated yet.
 *
 * TODO: this belongs on the backend once `raport` is actually written to. The
 * shape of WeeklyReport is the contract to aim at, and this file then becomes
 * the mapping layer (like api/dashboard.ts) instead of the aggregation.
 */

import { addDays, fromIsoDate, startOfWeek, toIsoDate } from './days'
import { EMOTION_COLORS, STRES, type EmotionName } from './emotions'
import { MOOD_RANK } from './moods'
import { placeLabel } from './triggers'
import type { JournalListEntry } from '../types/diaryEntry'
import type {
  Delta,
  DeltaTone,
  EmotionDays,
  ReportChangeChip,
  ReportMetric,
  RiskyDay,
  TriggerDays,
  WeeklyReport,
} from '../types/report'

export const DAYS_IN_WEEK = 7

/** The 1-5 mood scale (utils/moods.ts) and the 0-10 sliders, as denominators. */
const MOOD_SCALE_MAX = 5
const LEVEL_SCALE_MAX = 10

/** "Trudniejsze dni" — the same threshold as the Dzienniczki list's filter, so
 *  a day counted here is a day that screen also calls harder. */
const HARD_DAY_MAX_RANK = 2

const TOP_EMOTIONS = 5
const TOP_TRIGGERS = 4
/** Chips under the narrative summary: the two emotions that moved most. */
const SUMMARY_CHIP_EMOTIONS = 2

/** Same one-line trim as the Dzienniczki list preview. */
const PREVIEW_LENGTH = 90

/** Emotion declaration order, used to break ties in the ranking so equal counts
 *  don't reorder themselves between renders. */
const EMOTION_ORDER = Object.keys(EMOTION_COLORS) as EmotionName[]

// ---- Formatting ----------------------------------------------------------------

/** Polish decimal comma, so '3.1' never reaches the screen. */
export function formatNumber(value: number, decimals: 0 | 1): string {
  return value.toFixed(decimals).replace('.', ',')
}

/** '3,1 / 5', or '— / 5' when the week rated nothing to average. */
export function formatAverage(value: number | null, max: number): string {
  return `${value === null ? '—' : formatNumber(value, 1)} / ${max}`
}

/** Polish plural for a day count: 1 dzień, 3 dni, 7 dni. */
export function pluralDays(count: number): string {
  return count === 1 ? 'dzień' : 'dni'
}

/** Polish plural for an entry count: 1 wpis, 3 wpisy, 5 wpisów. */
export function pluralEntries(count: number): string {
  if (count === 1) return 'wpis'
  return count >= 2 && count <= 4 ? 'wpisy' : 'wpisów'
}

/**
 * A change as a direction and a value, never as a verdict: '+0,6', '−4 dni',
 * 'bez zmian'. null when there is no previous week to compare with.
 *
 * The minus is U+2212, not a hyphen — it lines up with the plus at the same
 * optical weight, which matters when the two sit in a column of cards.
 */
export function formatDelta(delta: Delta): string | null {
  if (delta.value === null) return null
  if (delta.value === 0) return 'bez zmian'
  const sign = delta.value > 0 ? '+' : '−'
  const magnitude = formatNumber(Math.abs(delta.value), delta.decimals)
  return `${sign}${magnitude}${delta.unit ? ` ${delta.unit}` : ''}`
}

/** The same change as a full line for a metric card.
 *
 * A missing number is not one case but two, and they must not share a sentence:
 * "there is no previous week" is false for a week that exists and simply never
 * rated this metric. */
export function formatDeltaSentence(delta: Delta): string {
  const change = formatDelta(delta)
  if (change !== null) return `${change} od poprzedniego tygodnia`
  return delta.gap === 'unrated'
    ? 'za mało ocen, żeby porównać z poprzednim tygodniem'
    : 'brak poprzedniego tygodnia do porównania'
}

/** '3 – 9 sierpnia 2026', dropping whatever the two ends share. */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const from = fromIsoDate(weekStart)
  const to = fromIsoDate(weekEnd)
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
  const sameYear = from.getFullYear() === to.getFullYear()

  const fromLabel = sameMonth
    ? String(from.getDate())
    : from.toLocaleDateString('pl-PL', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
  const toLabel = to.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })

  return `${fromLabel} – ${toLabel}`
}

/** One line of a longer note, for a preview that links to the whole thing. */
function truncate(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= PREVIEW_LENGTH) return trimmed
  return `${trimmed.slice(0, PREVIEW_LENGTH).trimEnd()}…`
}

// ---- Per-week aggregation ------------------------------------------------------

function average(values: number[]): number | null {
  if (values.length === 0) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  return round1(total / values.length)
}

/** Keeps 5.699999999999999 out of both the screen and the deltas. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** The rating this entry gave one emotion, or null if it never named it. */
function intensityOf(entry: JournalListEntry, emotion: EmotionName): number | null {
  return entry.emotions.find((rating) => rating.emotion === emotion)?.intensity ?? null
}

function isHardDay(entry: JournalListEntry): boolean {
  return entry.mood !== null && MOOD_RANK[entry.mood] <= HARD_DAY_MAX_RANK
}

/** Days on which each emotion was rated — the ranking's raw counts. */
function emotionDayCounts(entries: JournalListEntry[]): Map<EmotionName, number> {
  const counts = new Map<EmotionName, number>()
  for (const entry of entries) {
    for (const rating of entry.emotions) {
      counts.set(rating.emotion, (counts.get(rating.emotion) ?? 0) + 1)
    }
  }
  return counts
}

interface WeekStats {
  /** 1-5, averaged over the days that answered the mood question. */
  mood: number | null
  /** 0-10. Stress is one of the ten emotions, rated on the entry form's chip. */
  stress: number | null
  energy: number | null
  tension: number | null
  hardDays: number
  emotionDays: Map<EmotionName, number>
}

function weekStats(entries: JournalListEntry[]): WeekStats {
  return {
    mood: average(entries.map((entry) => (entry.mood === null ? null : MOOD_RANK[entry.mood])).filter(isNumber)),
    stress: average(entries.map((entry) => intensityOf(entry, STRES)).filter(isNumber)),
    energy: average(entries.map((entry) => entry.energyLevel).filter(isNumber)),
    tension: average(entries.map((entry) => entry.tensionLevel).filter(isNumber)),
    hardDays: entries.filter(isHardDay).length,
    emotionDays: emotionDayCounts(entries),
  }
}

/** A slider left at 0 is an answer; only null means "not answered". */
function isNumber(value: number | null): value is number {
  return value !== null
}

// ---- Changes against the previous week ----------------------------------------

/** Which way this metric would have to move for the change to be the reassuring one. */
type Favourable = 'higher' | 'lower'

/**
 * Only metrics whose direction the app already asserts elsewhere get a tone.
 *
 * Mood is an ordered scale, "trudniejsze dni" says so in its name, and the
 * energy/tension sliders are labelled 'wyczerpanie ↔ pełnia energii' and
 * 'rozluźnienie ↔ skrajne napięcie' on the entry form. Emotions are not on that
 * list on purpose: whether more days of 'Lęk' is bad is a clinical judgement,
 * not something this screen is entitled to colour in.
 */
function tone(value: number | null, favourable: Favourable): DeltaTone {
  if (value === null || value === 0) return 'neutral'
  const rose = value > 0
  return rose === (favourable === 'higher') ? 'good' : 'watch'
}

/**
 * One average against the week before it.
 *
 * `hasPrevious` is passed separately rather than inferred from `previous`: a
 * previous week that exists but left this metric unrated is a different answer
 * from no previous week at all, and only the caller knows which it is.
 */
function averageDelta(
  current: number | null,
  previous: number | null,
  hasPrevious: boolean,
  favourable: Favourable,
): Delta {
  const value = current === null || previous === null ? null : round1(current - previous)
  const gap = value !== null ? null : hasPrevious ? 'unrated' : 'no-previous-week'
  return { value, gap, decimals: 1, unit: '', tone: tone(value, favourable) }
}

/** A day count is answered by every week that exists, so 'unrated' cannot arise here. */
function countDelta(value: number | null, favourable: Favourable, unit: string): Delta {
  return {
    value,
    gap: value === null ? 'no-previous-week' : null,
    decimals: 0,
    unit,
    tone: tone(value, favourable),
  }
}

/** Emotions that changed how often they were rated, biggest move first. */
function emotionChanges(current: WeekStats, previous: WeekStats): ReportChangeChip[] {
  const emotions = new Set<EmotionName>([...current.emotionDays.keys(), ...previous.emotionDays.keys()])
  return [...emotions]
    .map((emotion) => ({
      label: emotion,
      value: (current.emotionDays.get(emotion) ?? 0) - (previous.emotionDays.get(emotion) ?? 0),
    }))
    .filter((change) => change.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || EMOTION_ORDER.indexOf(a.label) - EMOTION_ORDER.indexOf(b.label))
    .slice(0, SUMMARY_CHIP_EMOTIONS)
    .map((change) => ({
      label: change.label,
      // No favourable direction for an emotion, so no colour — see tone() above.
      // The unit declines with the number: '−1 dzień', not '−1 dni'.
      delta: {
        value: change.value,
        gap: null,
        decimals: 0 as const,
        unit: pluralDays(Math.abs(change.value)),
        tone: 'neutral' as const,
      },
    }))
}

// ---- Narrative summary ---------------------------------------------------------

/**
 * A plain-language recap of the same numbers the cards show.
 *
 * Deliberately a factual composition rather than prose: it states what happened
 * and by how much, and never how the patient did.
 *
 * TODO: mock. The real narrative is generated where the report itself is
 * (`raport` in medical_db) — a second opinion invented on this screen would
 * quietly disagree with the one the specialist reads.
 */
function buildSummary(
  entries: JournalListEntry[],
  stats: WeekStats,
  previous: WeekStats | null,
  emotions: EmotionDays[],
  riskyDays: RiskyDay[],
): string {
  const sentences: string[] = [
    `W tym tygodniu masz ${entries.length} ${pluralEntries(entries.length)} z ${DAYS_IN_WEEK} dni.`,
  ]

  const [topEmotion] = emotions
  if (topEmotion) {
    sentences.push(
      `Najczęściej zapisywana emocja: ${topEmotion.emotion} (${topEmotion.days} ${pluralDays(topEmotion.days)}).`,
    )
  }

  if (previous === null) {
    sentences.push('Nie ma jeszcze poprzedniego tygodnia z wpisami, więc nie ma z czym porównać tych liczb.')
  } else if (previous.mood === null || stats.mood === null) {
    // The week before exists — saying otherwise would be untrue. What is missing
    // is the mood answer, in one of the two weeks.
    sentences.push('W jednym z tych tygodni nastrój nie został oceniony, więc średnich nie da się porównać.')
  } else {
    sentences.push(
      `Średni nastrój zmienił się z ${formatNumber(previous.mood, 1)} na ${formatNumber(stats.mood, 1)}.`,
    )
  }

  if (riskyDays.length > 0) {
    sentences.push(
      `Dni z oznaczonym zachowaniem ryzykownym: ${riskyDays.length} z ${DAYS_IN_WEEK}.`,
    )
  }

  return sentences.join(' ')
}

// ---- Building the reports ------------------------------------------------------

/** The route param and the map key for one week: 'week-2026-08-03'. */
export function weekReportId(weekStart: string): string {
  return `week-${weekStart}`
}

function rankEmotions(counts: Map<EmotionName, number>): EmotionDays[] {
  return [...counts.entries()]
    .map(([emotion, days]) => ({ emotion, days }))
    .sort((a, b) => b.days - a.days || EMOTION_ORDER.indexOf(a.emotion) - EMOTION_ORDER.indexOf(b.emotion))
    .slice(0, TOP_EMOTIONS)
}

function rankTriggers(entries: JournalListEntry[]): TriggerDays[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const place = placeLabel(entry.situationReaction)
    if (place === null) continue
    counts.set(place, (counts.get(place) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([trigger, days]) => ({ trigger, days }))
    .sort((a, b) => b.days - a.days || a.trigger.localeCompare(b.trigger, 'pl'))
    .slice(0, TOP_TRIGGERS)
}

/** Oldest first, so the list reads as the week did. */
function riskyDaysOf(entries: JournalListEntry[]): RiskyDay[] {
  return entries
    .filter((entry) => entry.hasRiskyBehavior)
    .map((entry) => ({
      entryId: entry.id,
      date: entry.date,
      notePreview: truncate(entry.riskyBehaviorNote),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function buildMetrics(stats: WeekStats, previous: WeekStats | null): ReportMetric[] {
  const hasPrevious = previous !== null
  return [
    {
      key: 'mood',
      label: 'Średni nastrój',
      value: formatAverage(stats.mood, MOOD_SCALE_MAX),
      delta: averageDelta(stats.mood, previous?.mood ?? null, hasPrevious, 'higher'),
    },
    {
      key: 'stress',
      label: 'Średni poziom stresu',
      value: formatAverage(stats.stress, LEVEL_SCALE_MAX),
      delta: averageDelta(stats.stress, previous?.stress ?? null, hasPrevious, 'lower'),
    },
    {
      key: 'energy',
      label: 'Średni poziom energii',
      value: formatAverage(stats.energy, LEVEL_SCALE_MAX),
      delta: averageDelta(stats.energy, previous?.energy ?? null, hasPrevious, 'higher'),
    },
    {
      key: 'hardDays',
      label: 'Trudniejsze dni',
      value: `${stats.hardDays} z ${DAYS_IN_WEEK}`,
      // A week with no entries at all is not "zero harder days", so it has no
      // previous value to subtract from.
      delta: countDelta(previous === null ? null : stats.hardDays - previous.hardDays, 'lower', ''),
    },
  ]
}

function buildChanges(stats: WeekStats, previous: WeekStats | null): ReportChangeChip[] {
  if (previous === null) return []
  return [
    { label: 'Nastrój', delta: averageDelta(stats.mood, previous.mood, true, 'higher') },
    ...emotionChanges(stats, previous),
    { label: 'Napięcie', delta: averageDelta(stats.tension, previous.tension, true, 'lower') },
  ].filter((chip) => chip.delta.value !== null && chip.delta.value !== 0)
}

function buildReport(
  weekStart: string,
  entries: JournalListEntry[],
  previousEntries: JournalListEntry[],
): WeeklyReport {
  const weekEnd = toIsoDate(addDays(fromIsoDate(weekStart), DAYS_IN_WEEK - 1))
  const stats = weekStats(entries)
  // No entries in the week before means nothing to compare against, which is
  // different from comparing against zeroes.
  const previous = previousEntries.length > 0 ? weekStats(previousEntries) : null
  const emotions = rankEmotions(stats.emotionDays)
  const riskyDays = riskyDaysOf(entries)

  return {
    id: weekReportId(weekStart),
    weekStart,
    weekEnd,
    rangeLabel: formatWeekRange(weekStart, weekEnd),
    entryCount: entries.length,
    metrics: buildMetrics(stats, previous),
    emotions,
    triggers: rankTriggers(entries),
    riskyDays,
    changes: buildChanges(stats, previous),
    summary: buildSummary(entries, stats, previous, emotions, riskyDays),
  }
}

/**
 * Every weekly report this patient's diary supports, newest first.
 *
 * Two weeks are deliberately absent: the one in progress (the app generates a
 * report when a week ends, not while it runs) and any week with no entries at
 * all (diaries are the only source, so there would be nothing to report). A week
 * with no entries still counts as "no previous week" for the week after it,
 * which is why the deltas there read as "brak poprzedniego tygodnia" rather than
 * as a drop to zero.
 */
export function buildWeeklyReports(entries: JournalListEntry[], today: Date = new Date()): WeeklyReport[] {
  // Grouping is zone-safe (an entry's `date` is already a calendar day), but the
  // "has this week ended" cutoff is read from the *client* clock while the dates
  // come from Europe/Warsaw (`core/days.py`). Far enough west, the week the
  // backend already considers over still looks current here for a few hours, and
  // its report shows up late. Not worth a hardcoded second copy of
  // settings.TIME_ZONE in the browser — the fix is for the backend to say which
  // weeks have reports, which is where this function is headed anyway.
  const byWeek = new Map<string, JournalListEntry[]>()
  for (const entry of entries) {
    const weekStart = toIsoDate(startOfWeek(fromIsoDate(entry.date)))
    const week = byWeek.get(weekStart)
    if (week) week.push(entry)
    else byWeek.set(weekStart, [entry])
  }

  const currentWeekStart = toIsoDate(startOfWeek(today))

  return [...byWeek.keys()]
    // ISO dates sort lexicographically, so this is chronological order reversed.
    .filter((weekStart) => weekStart < currentWeekStart)
    .sort((a, b) => b.localeCompare(a))
    .map((weekStart) => {
      const previousWeekStart = toIsoDate(addDays(fromIsoDate(weekStart), -DAYS_IN_WEEK))
      return buildReport(weekStart, byWeek.get(weekStart) ?? [], byWeek.get(previousWeekStart) ?? [])
    })
}

/** One report by its route id, or null when the id names no week with entries. */
export function findWeeklyReport(reports: WeeklyReport[], id: string): WeeklyReport | null {
  return reports.find((report) => report.id === id) ?? null
}
