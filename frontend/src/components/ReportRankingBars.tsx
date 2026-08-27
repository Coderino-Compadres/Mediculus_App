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
   * answer here, so the row simply does not render the second number.
   */
  average?: number | null
}

/**
 * A ranking as horizontal bars — the mockup's shape for both "Najczęściej
 * odczuwane emocje" and "Najczęstsze wyzwalacze".
 *
 * Bars are scaled against the top row rather than against the seven days of the
 * week, because the ranking is about order and relative weight; the exact day
 * count is spelled out next to every label anyway. The track itself is
 * aria-hidden for that reason: it repeats a number the row already states.
 *
 * The bar length stays the day count even where an average is shown. Both order
 * and length answer "how often", which is what the section heading asks; how
 * strongly is the second number, and mixing the two into one bar would make
 * neither readable.
 */
function ReportRankingBars({ rows, emptyText }: { rows: RankingRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="report-empty">{emptyText}</p>
  }

  const top = Math.max(...rows.map((row) => row.count))

  return (
    <div className="report-ranking">
      {rows.map((row) => (
        <div className="report-ranking-row" key={row.label}>
          <div className="report-ranking-header">
            <span className="report-ranking-label">{row.label}</span>
            <span className="report-ranking-count">
              {row.count} {pluralDays(row.count)}
              {row.average != null && (
                <span className="report-ranking-average">
                  {' · '}śr. {formatNumber(row.average, 1)} / {LEVEL_SCALE_MAX}
                </span>
              )}
            </span>
          </div>
          <div className="report-ranking-track" aria-hidden="true">
            <div
              className="report-ranking-fill"
              style={{ width: `${(row.count / top) * 100}%`, backgroundColor: row.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default ReportRankingBars
