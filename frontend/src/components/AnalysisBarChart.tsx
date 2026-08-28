export interface BarRow {
  /** React key — the label is not always unique enough ('Tyg. 1' vs an emotion). */
  key: string
  /** Printed under the bar. */
  label: string
  value: number
  /** Emotions bring theirs from utils/emotions.ts; the week bars use a sage shade. */
  color: string
  /** Tooltip and screen-reader text — the bar itself carries only a colour. */
  title: string
}

/**
 * A row of vertical bars: the count above, the bar, the name below.
 *
 * The shape both "Udział emocji" and "Częstotliwość wpisów" need, so it is one
 * component rather than two nearly identical ones — the ranking bars on a weekly
 * report (ReportRankingBars) are horizontal and answer a different question, so
 * they stay separate.
 *
 * Bars are scaled against the tallest one, not against an absolute maximum: the
 * exact number is printed on every bar anyway, and a month where the patient
 * wrote three times would otherwise be four bars all but flat against the floor.
 * A caller that does need an absolute ceiling passes it as `max`.
 *
 * The row scrolls sideways rather than squeezing: ten emotions with names like
 * "Poczucie winy" do not fit across a phone, and a label rotated to fit is a
 * label nobody reads.
 */
function AnalysisBarChart({
  rows,
  emptyText,
  max,
}: {
  rows: BarRow[]
  emptyText: string
  /** Absolute ceiling for the bar heights; defaults to the tallest row. */
  max?: number
}) {
  if (rows.length === 0) {
    return <p className="analysis-empty">{emptyText}</p>
  }

  const ceiling = Math.max(max ?? 0, ...rows.map((row) => row.value), 1)

  return (
    <div className="analysis-bars">
      {rows.map((row) => (
        <div className="analysis-bar-column" key={row.key}>
          <span className="analysis-bar-value">{row.value}</span>
          <div className="analysis-bar-track" title={row.title}>
            <div
              className="analysis-bar-fill"
              style={{ height: `${(row.value / ceiling) * 100}%`, backgroundColor: row.color }}
            />
          </div>
          <span className="analysis-bar-label">{row.label}</span>
          <span className="visually-hidden">{row.title}</span>
        </div>
      ))}
    </div>
  )
}

export default AnalysisBarChart
