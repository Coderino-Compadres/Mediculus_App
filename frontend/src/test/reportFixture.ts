/**
 * A `WeeklyReport` as the API hands one over.
 *
 * The screens no longer derive anything — `core/reports.py` does, and its own
 * tests cover the numbers. What these fixtures are for is the rendering: the
 * shape arrives complete, so a page test says what the screen does with a
 * report rather than re-deriving one from diary entries.
 */

import type { Delta, ReportMetric, WeeklyReport } from '../types/report'

export function delta(overrides: Partial<Delta> = {}): Delta {
  return { value: null, gap: 'no-previous-week', decimals: 1, unit: '', tone: 'neutral', ...overrides }
}

function metric(
  key: ReportMetric['key'], label: string, value: string, change: Partial<Delta> = {},
): ReportMetric {
  return { key, label, value, delta: delta(change) }
}

export const WEEK_A = '2026-08-03' // Mon 3 – Sun 9 August 2026
export const WEEK_B = '2026-08-10' // Mon 10 – Sun 16 August 2026

export function reportFixture(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  const weekStart = overrides.weekStart ?? WEEK_B
  return {
    id: `week-${weekStart}`,
    weekStart,
    weekEnd: '2026-08-16',
    rangeLabel: '10 – 16 sierpnia 2026',
    entryCount: 3,
    metrics: [
      metric('mood', 'Średni nastrój', '3,0 / 5', { value: 0.5, gap: null, tone: 'good' }),
      metric('stress', 'Średni poziom stresu', '6,0 / 10', { value: 1.2, gap: null, tone: 'watch' }),
      metric('energy', 'Średni poziom energii', '4,0 / 10', { value: 0, gap: null }),
      metric('hardDays', 'Trudniejsze dni', '1 z 7', { value: -1, gap: null, decimals: 0, tone: 'good' }),
    ],
    emotions: [{ emotion: 'Lęk', days: 3 }, { emotion: 'Smutek', days: 1 }],
    triggers: [{ trigger: 'Praca', days: 2 }, { trigger: 'Dom', days: 1 }],
    riskyDays: [],
    changes: [{ label: 'Nastrój', delta: delta({ value: 0.5, gap: null, tone: 'good' }) }],
    summary: 'W tym tygodniu masz 3 wpisy z 7 dni.',
    ...overrides,
  }
}
