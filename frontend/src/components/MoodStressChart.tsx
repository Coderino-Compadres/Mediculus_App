import { EMOTION_COLORS, STRES } from '../utils/emotions'
import { MOOD_SCALE_MAX } from '../utils/analysis'
import { LEVEL_SCALE_MAX, formatNumber } from '../utils/reports'
import type { TrendPoint } from '../types/analysis'

/**
 * "Zmiany samopoczucia w czasie" — mood and stress as two lines over the same
 * days.
 *
 * Drawn as inline SVG rather than with a charting library: the project has none
 * (Home's 7-day chart and the report rankings are hand-drawn too), and adding
 * ~90 kB to a PWA's bundle for two polylines is not a trade this screen needs.
 *
 * The two series share one plot area on purpose — the point of the chart is the
 * relationship between them, and two stacked charts would leave the reader to
 * do that comparison by eye across a gap. They do *not* share a unit, though:
 * mood is the 1-5 tile scale and stress the 0-10 chip scale, so each is drawn
 * against its own range and the legend spells that out. Up is "more" in both
 * cases, which means a good week reads as the lines pulling apart and a hard one
 * as them crossing.
 */

interface Series {
  label: string
  color: string
  /** What the axis means for this line, said in the legend rather than implied. */
  scaleLabel: string
  read: (point: TrendPoint) => number | null
  /** Value → 0-1 position in the plot area, on this series' own scale. */
  fraction: (value: number) => number
  format: (value: number) => string
}

const SERIES: Series[] = [
  {
    label: 'Nastrój',
    color: 'var(--color-sage)',
    scaleLabel: `1–${MOOD_SCALE_MAX}`,
    read: (point) => point.mood,
    fraction: (value) => (value - 1) / (MOOD_SCALE_MAX - 1),
    format: (value) => `${formatNumber(value, 0)} / ${MOOD_SCALE_MAX}`,
  },
  {
    label: 'Poziom stresu',
    // The same colour stress carries everywhere else in the app — the emotion
    // palette's own entry for it, not a second warning red invented here.
    color: EMOTION_COLORS[STRES],
    scaleLabel: `0–${LEVEL_SCALE_MAX}`,
    read: (point) => point.stress,
    fraction: (value) => value / LEVEL_SCALE_MAX,
    format: (value) => `${formatNumber(value, 0)} / ${LEVEL_SCALE_MAX}`,
  },
]

/** A fixed viewBox scaled to the container's width: the SVG stays crisp at any
 *  size, and a uniform scale keeps the stroke weight even. */
const VIEW_WIDTH = 340
const VIEW_HEIGHT = 150
const PADDING = { left: 10, right: 10, top: 10, bottom: 24 }
const PLOT_WIDTH = VIEW_WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = VIEW_HEIGHT - PADDING.top - PADDING.bottom

/** Beyond this many points every second date label is dropped; they overlap
 *  otherwise. The parity is counted from the *end* — see `showsTick`. */
const DENSE_LABEL_THRESHOLD = 8

/**
 * Whether this day's date is printed under the chart.
 *
 * Counted backwards from the last point, so today is always labelled and the
 * thinning never puts two ticks side by side. Counting forwards and then
 * exempting the last point — the obvious way to keep today — collides at every
 * even point count, which includes the 14 the chart shows by default: indices
 * 12 and 13 would both render, about 25 viewBox units apart, under labels about
 * that wide.
 */
function showsTick(index: number, count: number): boolean {
  if (count <= DENSE_LABEL_THRESHOLD) return true
  return (count - 1 - index) % 2 === 0
}

function xFor(index: number, count: number): number {
  if (count <= 1) return PADDING.left + PLOT_WIDTH / 2
  return PADDING.left + (index / (count - 1)) * PLOT_WIDTH
}

function yFor(fraction: number): number {
  return PADDING.top + (1 - Math.min(1, Math.max(0, fraction))) * PLOT_HEIGHT
}

interface Dot {
  index: number
  x: number
  y: number
  value: number
}

/**
 * The series split into runs of consecutive days that were actually rated.
 *
 * A day with no entry — or one that skipped this question — breaks the line
 * instead of being interpolated across. Joining over it would draw a value the
 * patient never gave, on a chart whose whole subject is how they felt.
 */
function runsOf(points: TrendPoint[], series: Series): Dot[][] {
  const runs: Dot[][] = []
  let current: Dot[] = []

  points.forEach((point, index) => {
    const value = series.read(point)
    if (value === null) {
      if (current.length > 0) runs.push(current)
      current = []
      return
    }
    current.push({ index, x: xFor(index, points.length), y: yFor(series.fraction(value)), value })
  })
  if (current.length > 0) runs.push(current)

  return runs
}

function MoodStressChart({ points, days }: { points: TrendPoint[]; days: number }) {
  const drawn = SERIES.map((series) => ({ series, runs: runsOf(points, series) }))
  const hasData = drawn.some((line) => line.runs.length > 0)

  const subtitle =
    days === 1
      ? 'Nastrój i poziom stresu, dzisiaj'
      : `Nastrój i poziom stresu, ostatnie ${days} dni`

  return (
    <section className="analysis-card">
      <h2>Zmiany samopoczucia w czasie</h2>
      <p className="analysis-card-subtitle">{subtitle}</p>

      {!hasData ? (
        <p className="analysis-empty">
          Żaden wpis z tego okresu nie zawiera oceny nastroju ani poziomu stresu.
        </p>
      ) : (
        <>
          <svg
            className="analysis-line-chart"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            aria-label={`Wykres liniowy: ${subtitle.toLowerCase()}.`}
          >
            {/* Three rules rather than a numbered axis: with two different scales
                sharing the plot, a number down the side would belong to only one
                of the lines and quietly mislabel the other. */}
            {[0, 0.5, 1].map((fraction) => (
              <line
                key={fraction}
                className="analysis-line-grid"
                x1={PADDING.left}
                x2={PADDING.left + PLOT_WIDTH}
                y1={yFor(fraction)}
                y2={yFor(fraction)}
              />
            ))}

            {drawn.map(({ series, runs }) => (
              <g key={series.label}>
                {runs.map((run) =>
                  run.length > 1 ? (
                    <polyline
                      key={`line-${run[0].index}`}
                      className="analysis-line-path"
                      points={run.map((dot) => `${dot.x},${dot.y}`).join(' ')}
                      stroke={series.color}
                    />
                  ) : null,
                )}
                {runs.flat().map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    className="analysis-line-dot"
                    cx={dot.x}
                    cy={dot.y}
                    r={3}
                    fill={series.color}
                  >
                    <title>{`${points[dot.index].dayLabel} — ${series.label.toLowerCase()} ${series.format(dot.value)}`}</title>
                  </circle>
                ))}
              </g>
            ))}

            {points.map((point, index) =>
              !showsTick(index, points.length) ? null : (
                <text
                  key={point.date}
                  className="analysis-line-tick"
                  x={xFor(index, points.length)}
                  y={VIEW_HEIGHT - 6}
                  textAnchor="middle"
                >
                  {point.dayLabel}
                </text>
              ),
            )}
          </svg>

          <div className="analysis-legend">
            {SERIES.map((series) => (
              <span className="analysis-legend-item" key={series.label}>
                <span className="analysis-legend-dot" style={{ backgroundColor: series.color }} />
                {series.label}
                <span className="analysis-legend-scale">skala {series.scaleLabel}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default MoodStressChart
