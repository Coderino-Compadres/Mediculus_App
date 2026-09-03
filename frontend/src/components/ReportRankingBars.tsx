import { LEVEL_SCALE_MAX, formatNumber, pluralDays } from '../utils/reports'

export interface RankingRow {
  /** React key and label in one — the emotion or trigger name. */
  label: string
  count: number
  /** Bar colour. Emotions bring theirs from utils/emotions.ts; triggers share one sage tone. */
  color: string
  /**
   * Mean intensity on the 0-10 scale, for rankings that have one.
   *
   * null for triggers: a place has no intensity. Undefined and null are the same
   * answer here, so the row falls back to reporting the count alone — and a
   * caller passing `measure="average"` without one would draw empty bars, which
   * is why the emotions ranking is the only one that does.
   */
  average?: number | null
}

/**
 * A ranking as horizontal bars — the mockup's shape for both "Najsilniej
 * odczuwane emocje" and "Najczęstsze wyzwalacze".
 *
 * WHAT THE BAR MEASURES IS THE CALLER'S CHOICE, because the two rankings do not
 * measure the same thing and one length cannot serve both:
 *
 *   - `measure="count"` (triggers) scales each bar against the longest row. A
 *     day count has no meaningful ceiling to draw against — the ranking is
 *     about order and relative weight, and the exact count is spelled out next
 *     to the label anyway.
 *   - `measure="average"` (emotions) scales against the rating scale itself,
 *     0-10. Intensity *has* a fixed ceiling, and drawing it relative to the top
 *     row would make a calm week look exactly like a desperate one: the
 *     strongest feeling would fill the bar whether it averaged 9 or 1.5.
 *
 * The emotions ranking used to measure days, and that is what this replaces.
 * Week 2026-08-24 is the case that settled it: 'Smutek' averaged 0.8/10 across
 * five days and drew a bar 83% as long as the week's strongest feeling. The
 * number was on the row the whole time; the bar contradicted it, and a bar is
 * what gets read first.
 *
 * The track is aria-hidden either way: it repeats a number the row states.
 */
function ReportRankingBars({
  rows,
  emptyText,
  measure = 'count',
}: {
  rows: RankingRow[]
  emptyText: string
  measure?: 'count' | 'average'
}) {
  if (rows.length === 0) {
    return <p className="report-empty">{emptyText}</p>
  }

  const byAverage = measure === 'average'
  // Guarded so an all-zero week cannot divide by zero: every bar is simply empty,
  // which is the honest picture of emotions all rated 0.
  const top = byAverage
    ? LEVEL_SCALE_MAX
    : Math.max(...rows.map((row) => row.count)) || 1

  return (
    <div className="report-ranking">
      {rows.map((row) => (
        <div className="report-ranking-row" key={row.label}>
          <div className="report-ranking-header">
            <span className="report-ranking-label">{row.label}</span>
            {/* The number the bar draws comes first, so the label and the
                length say the same thing. The other one stays on the row —
                dropping it would lose a real reading, it is just not the one
                a length can carry here. */}
            <span className="report-ranking-count">
              {row.average != null ? (
                <>
                  śr. {formatNumber(row.average, 1)} / {LEVEL_SCALE_MAX}
                  <span className="report-ranking-average">
                    {' · '}
                    {row.count} {pluralDays(row.count)}
                  </span>
                </>
              ) : (
                <>
                  {row.count} {pluralDays(row.count)}
                </>
              )}
            </span>
          </div>
          <div className="report-ranking-track" aria-hidden="true">
            <div
              className="report-ranking-fill"
              style={{
                width: `${((byAverage ? (row.average ?? 0) : row.count) / top) * 100}%`,
                backgroundColor: row.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default ReportRankingBars
