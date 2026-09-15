import { LEVEL_SCALE_MAX, formatNumber, pluralDays } from '../utils/reports'
import './charts.css'

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
   * is why the psychotherapy emotions ranking is the only one that does.
   */
  average?: number | null
  /**
   * A caveat printed under the row, or nothing.
   *
   * It exists for one real case and should not grow others: the diet module's
   * chips may be picked *without* being rated (`diet_meal_emotion.intensity` is
   * nullable on purpose), so an average there can rest on fewer meals than the
   * count beside it. A row that said "7 posiłków · śr. 6,5 / 10" with two of
   * those seven unrated would be claiming a precision nobody entered. The
   * psychotherapy ranking never sets it — every rating in that diary carries an
   * intensity, so the two counts cannot disagree.
   */
  note?: string | null
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
 *   - `measure="average"` (the psychotherapy report's emotions) scales against
 *     the rating scale itself, 0-10. Intensity *has* a fixed ceiling, and
 *     drawing it relative to the top row would make a calm week look exactly
 *     like a desperate one: the strongest feeling would fill the bar whether it
 *     averaged 9 or 1.5.
 *
 * That ranking used to measure days, and `measure` is what replaced it. Week
 * 2026-08-24 is the case that settled it: 'Smutek' averaged 0.8/10 across five
 * days and drew a bar 83% as long as the week's strongest feeling. The number
 * was on the row the whole time; the bar contradicted it, and a bar is what gets
 * read first.
 *
 * **THE DIET MODULE'S EMOTIONS RANKING GOES BACK TO `measure="count"`, AND THAT
 * IS NOT A RELAPSE INTO THE BUG ABOVE.** What settled the case above is that a
 * length has to draw the thing the section is *about*, and the two sections are
 * about different things: "Najsilniej odczuwane emocje" is about strength, while
 * §05's "Najczęstsze emocje przy jedzeniu" is named for frequency. The reading
 * that misled there — a weak feeling drawing a long bar — cannot arise here,
 * because the length means "how often" and says so in the heading. Both numbers
 * are on both rows either way; `measure` only decides which one the bar draws
 * and, below, which one is printed first.
 *
 * `countLabel` renders the count *with* its noun, because the two rankings do
 * not count the same thing: days on a psychotherapy report, meals on a diet one
 * (an emotion there hangs off a meal, and two difficult meals on one Tuesday are
 * two things that happened). The whole phrase rather than just the noun, because
 * Polish declines both halves together and `pluralMeals` already returns
 * "5 posiłków" as one string. Defaulted, so the existing callers are unchanged.
 *
 * The track is aria-hidden either way: it repeats a number the row states.
 */
function ReportRankingBars({
  rows,
  emptyText,
  measure = 'count',
  countLabel = (count) => `${count} ${pluralDays(count)}`,
}: {
  rows: RankingRow[]
  emptyText: string
  measure?: 'count' | 'average'
  /** "5 dni" by default; the diet ranking passes `pluralMeals` for "5 posiłków". */
  countLabel?: (count: number) => string
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
            {/* **THE NUMBER THE BAR DRAWS COMES FIRST**, so the length and the
                figure in front of it say the same thing — which is why this
                follows `measure` rather than always leading with the average.
                The other number stays on the row either way: dropping it would
                lose a real reading, it is simply not the one a length can
                carry. A row with no average prints the count alone. */}
            <span className="report-ranking-count">
              {row.average != null ? (
                <>
                  {byAverage ? (
                    <>
                      śr. {formatNumber(row.average, 1)} / {LEVEL_SCALE_MAX}
                    </>
                  ) : (
                    countLabel(row.count)
                  )}
                  <span className="report-ranking-average">
                    {' · '}
                    {byAverage ? (
                      countLabel(row.count)
                    ) : (
                      <>
                        śr. {formatNumber(row.average, 1)} / {LEVEL_SCALE_MAX}
                      </>
                    )}
                  </span>
                </>
              ) : (
                countLabel(row.count)
              )}
            </span>
          </div>
          {/* Only where the two counts actually disagree — see `RankingRow.note`.
              Above the bar rather than below it, so it qualifies the figure it
              belongs to instead of looking like a caption for the next row. */}
          {row.note && <p className="report-ranking-note">{row.note}</p>}
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
