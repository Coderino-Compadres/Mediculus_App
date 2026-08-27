import type { EmotionName } from '../utils/emotions'

/**
 * The weekly report as the "Raporty" screens show it.
 *
 * Reports are generated automatically, once a week, from diary entries and
 * nothing else (both confirmed with the client). The patient neither creates one
 * nor picks a date range, which is why there is no draft type here and no
 * "period" field: a report always covers one Monday-Sunday week.
 */

/**
 * Whether a move in the observed direction is the reassuring one, one to keep an
 * eye on, or neither.
 *
 * 'watch' is a colour, not a verdict — the wording next to it always stays a
 * direction and a value ("+0,3"), never an assessment of the patient.
 */
export type DeltaTone = 'good' | 'watch' | 'neutral'

/**
 * Why a delta has no number, since the two reasons need different wording.
 *
 * 'no-previous-week' is the honest "this is the first week"; 'unrated' is a week
 * that exists but never answered this particular question — every field on the
 * entry form is optional, so a patient can log seven days and skip the mood
 * tiles throughout. Saying "there is no previous week" in that case would be a
 * false statement in a document a therapist reads.
 */
export type DeltaGap = 'no-previous-week' | 'unrated'

/** One metric's move against the previous calendar week. */
export interface Delta {
  /** Signed difference on the metric's own scale; null when there is nothing to compare. */
  value: number | null
  /** Set exactly when `value` is null, and says which of the two reasons applies. */
  gap: DeltaGap | null
  /** How many decimals to render — 1 for averages, 0 for day counts. */
  decimals: 0 | 1
  /** Rendered after the number: 'dni' for day counts, '' for averages. */
  unit: string
  tone: DeltaTone
}

/** One of the four cards at the top of a report. */
export interface ReportMetric {
  key: 'mood' | 'stress' | 'energy' | 'hardDays'
  label: string
  /** Pre-formatted, because the four cards do not share one scale ("3,1 / 5" next to "2 z 7"). */
  value: string
  delta: Delta
}

/** One row of the "Najczęściej odczuwane emocje" ranking. */
export interface EmotionDays {
  emotion: EmotionName
  /** Days in the week on which the entry rated this emotion. */
  days: number
}

/** One row of the "Najczęstsze wyzwalacze" ranking. */
export interface TriggerDays {
  /** A chip from utils/triggers.ts, or whatever the patient typed under "Inne". */
  trigger: string
  days: number
}

/** One day the patient flagged as containing risky behaviour. */
export interface RiskyDay {
  /** Routes to the diary entry itself — the report shows a preview, not the whole note. */
  entryId: string
  date: string
  /** Trimmed to one line; '' when the day was flagged with no description. */
  notePreview: string
}

/** One chip under the narrative summary, e.g. "Nastrój +0,6" or "Lęk −4 dni". */
export interface ReportChangeChip {
  /** What moved — 'Nastrój', 'Lęk', 'Napięcie'. */
  label: string
  delta: Delta
}

export interface WeeklyReport {
  /** 'week-2026-08-03' — the week's Monday, and the :id in the detail route. */
  id: string
  /** ISO dates of the Monday and Sunday the report covers. */
  weekStart: string
  weekEnd: string
  /** '3 – 9 sierpnia 2026', ready to render. */
  rangeLabel: string
  /** How many of the week's seven days hold an entry. */
  entryCount: number
  /** Always the four cards, in card order. */
  metrics: ReportMetric[]
  emotions: EmotionDays[]
  triggers: TriggerDays[]
  /** Empty is a normal, calm state — the section is shown either way. */
  riskyDays: RiskyDay[]
  /** Empty for the first week with entries: there is nothing behind it to compare against. */
  changes: ReportChangeChip[]
  summary: string
}
