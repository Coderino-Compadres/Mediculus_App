import { useId, useState } from 'react'
import { EMOTION_COLORS, STRES, type EmotionName } from '../utils/emotions'
import { MOOD_SCALE_MAX } from '../utils/analysis'
import { LEVEL_SCALE_MAX, formatNumber } from '../utils/reports'
import type { TrendPoint } from '../types/analysis'

/**
 * "Zmiany samopoczucia w czasie" — one answer from the diary, day by day.
 *
 * Drawn as inline SVG rather than with a charting library: the project has none
 * (Home's 7-day chart and the report rankings are hand-drawn too), and adding
 * ~90 kB to a PWA's bundle for one polyline is not a trade this screen needs.
 *
 * **One series at a time, chosen from the picker.** It used to draw mood and
 * stress together, each against its own range — mood on the tiles' 1-5 and
 * stress on the chips' 0-10 — sharing a plot area. Two units on one axis meant
 * the mood line sat above the stress line almost always, and a reader saw a
 * relationship ("my mood holds up even when I am stressed") that was an artefact
 * of the scaling, not something the entries said. In a mental-health app a
 * patient may well carry that conclusion around, so the comparison is gone
 * rather than re-drawn: the chart answers "how did this one thing move", and the
 * picker is how you ask about another.
 *
 * **Everything is normalized onto one 0-10 axis** — mood ×2, so its 1-5 becomes
 * 2-10; every slider and chip is already 0-10. That is what keeps the axis still
 * while the picker is used: a per-series range would rescale the grid under the
 * line and make two different weeks look alike. The numbers shown are the
 * normalized ones (`4 / 10`, never `2 / 5`), because a value read off a chart
 * has to mean what the axis it sits on says.
 */

/** The 1-5 mood tiles onto the shared 0-10 axis. Exactly ×2, so the tiles land
 *  on 2, 4, 6, 8, 10 and the arithmetic is exact at every step. */
export const MOOD_TO_LEVEL = LEVEL_SCALE_MAX / MOOD_SCALE_MAX

interface Series {
  key: string
  label: string
  color: string
  /**
   * The day's answer, already on the shared 0-10 axis.
   *
   * null is "never rated" — a day with no entry, or one that skipped this
   * question. Never a zero: zero is an answer the patient can give.
   */
  read: (point: TrendPoint) => number | null
}

/**
 * The four levels the entry form asks about outside the emotion picker.
 *
 * Their colours are the ones this chart and the app already use — the brand sage
 * for mood and the emotion palette's own entry for stress (never a second
 * warning red invented here), plus the theme's ochre and muted graphite for the
 * two sliders.
 *
 * Two of those overlap an emotion's hue, and that is worth knowing rather than
 * denying: `--color-ochre` is `#e0b45c`, which is exactly `EMOTION_COLORS.Radość`
 * — so "Poziom energii" and "Radość" draw the same-coloured line. It is tolerable
 * only because this chart shows **one series at a time** and the legend under it
 * always names which: the two hues are never in the plot together, so neither can
 * be mistaken for the other. What it does cost is recognition across a switch,
 * and the fix is a level colour that no emotion uses — `styles/theme.css` has no
 * such hue today, so that is a palette decision, not one to improvise here.
 *
 * Until then: never read a colour on this screen as *meaning* the emotion whose
 * value it happens to be. The same overlap exists on the week bars — see
 * `sageShade` in utils/analysis.ts.
 */
const LEVEL_SERIES: Series[] = [
  {
    key: 'mood',
    label: 'Nastrój',
    color: 'var(--color-sage)',
    read: (point) => (point.mood === null ? null : point.mood * MOOD_TO_LEVEL),
  },
  {
    // Stress is one of the ten emotions, so this option and the emotion group
    // would otherwise be the same series listed twice under two names. It stays
    // here, where it has been since the chart was two lines, and drops out of
    // the group below.
    key: 'stress',
    label: 'Poziom stresu',
    color: EMOTION_COLORS[STRES],
    read: (point) => point.emotions[STRES] ?? null,
  },
  {
    key: 'energy',
    label: 'Poziom energii',
    color: 'var(--color-ochre)',
    read: (point) => point.energy,
  },
  {
    key: 'tension',
    label: 'Poziom napięcia',
    color: 'var(--color-graphite-muted)',
    read: (point) => point.tension,
  },
]

/**
 * One option per emotion, in utils/emotions.ts' declaration order — the same
 * order the report rankings and "Udział emocji" tie-break on.
 *
 * All ten (less stress) are offered whether or not the window rated them: the
 * list is what the diary *can* record, so an emotion vanishing from it would
 * read as one the app stopped tracking rather than one this month held none of.
 * Picking an unrated one says so, in the chart's own empty state.
 */
const EMOTION_SERIES: Series[] = (Object.keys(EMOTION_COLORS) as EmotionName[])
  .filter((emotion) => emotion !== STRES)
  .map((emotion) => ({
    key: `emotion:${emotion}`,
    label: emotion,
    // Always the one palette — an emotion's colour is defined in exactly one
    // place and every screen reads it from there.
    color: EMOTION_COLORS[emotion],
    read: (point: TrendPoint) => point.emotions[emotion] ?? null,
  }))

const ALL_SERIES: Series[] = [...LEVEL_SERIES, ...EMOTION_SERIES]

/** Mood, because it is the answer most entries carry (one tap, at the top of the
 *  form) and the one the screen's own summary card already leads with. */
const DEFAULT_SERIES = LEVEL_SERIES[0]

/** A fixed viewBox scaled to the container's width: the SVG stays crisp at any
 *  size, and a uniform scale keeps the stroke weight even. */
const VIEW_WIDTH = 340
const VIEW_HEIGHT = 150
/** Room on the left for the axis numbers, which only became truthful once every
 *  series shared one scale — with two units in the plot a number down the side
 *  would have belonged to one line and mislabelled the other. */
const PADDING = { left: 22, right: 10, top: 10, bottom: 24 }
const PLOT_WIDTH = VIEW_WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = VIEW_HEIGHT - PADDING.top - PADDING.bottom

/** The rules across the plot, and the numbers beside them: the ends of the scale
 *  and its midpoint. Fixed, like the scale itself — switching series moves the
 *  line, never the grid. */
const AXIS_TICKS = [0, LEVEL_SCALE_MAX / 2, LEVEL_SCALE_MAX]

/**
 * The closest two date labels may sit, centre to centre, in viewBox units.
 *
 * A 'dd.mm' tick is five glyphs at `font-size: 9px` (analysis.css), so roughly
 * 26 units wide; this leaves a few units of air between neighbours. It is the
 * constraint that used to be expressed as "cap the chart at 14 days" — the line
 * itself is perfectly readable at thirty points, it was the labels underneath
 * that collided, so the limit belongs here rather than on how much history the
 * chart is allowed to show.
 */
const MIN_LABEL_SPACING = 32

/**
 * Print every Nth date, chosen so the labels do not overlap.
 *
 * Derived from the spacing rather than from a point-count threshold, so it
 * holds at any window length: 30 days label every third or fourth day, 14 label
 * every other, and anything up to about nine labels every day.
 */
function tickStep(count: number): number {
  if (count <= 1) return 1
  const gap = PLOT_WIDTH / (count - 1)
  return Math.max(1, Math.ceil(MIN_LABEL_SPACING / gap))
}

/**
 * Whether this day's date is printed under the chart.
 *
 * Counted backwards from the last point, so today is always labelled and the
 * thinning never puts two ticks side by side. Counting forwards and then
 * exempting the last point — the obvious way to keep today — collides whenever
 * the count is not a multiple of the step: the last two ticks would render a
 * fraction of a label apart.
 */
function showsTick(index: number, count: number): boolean {
  return (count - 1 - index) % tickStep(count) === 0
}

/**
 * Dots shrink when the days are packed close.
 *
 * At thirty points the gap is about 10 units and a radius-3 dot with its 1.5
 * white stroke is 9 across — the markers would read as a bead chain rather than
 * as points on a line. Below the threshold nothing changes, so the fourteen-day
 * view of a young account looks exactly as it did.
 */
function dotRadius(count: number): number {
  if (count <= 1) return 3
  return PLOT_WIDTH / (count - 1) < 14 ? 2 : 3
}

function xFor(index: number, count: number): number {
  if (count <= 1) return PADDING.left + PLOT_WIDTH / 2
  return PADDING.left + (index / (count - 1)) * PLOT_WIDTH
}

/** A 0-10 value's height in the plot. One scale for every series, which is the
 *  whole point of normalizing them. */
function yFor(value: number): number {
  const fraction = Math.min(1, Math.max(0, value / LEVEL_SCALE_MAX))
  return PADDING.top + (1 - fraction) * PLOT_HEIGHT
}

/** '4 / 10' — the value as the axis states it, never the scale it was entered
 *  on. Mood is the one that differs, and showing '2 / 5' beside a point sitting
 *  at 4 on the axis is exactly the confusion the normalization removes. */
function formatValue(value: number): string {
  return `${formatNumber(value, 0)} / ${LEVEL_SCALE_MAX}`
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
    current.push({ index, x: xFor(index, points.length), y: yFor(value), value })
  })
  if (current.length > 0) runs.push(current)

  return runs
}

function TrendChart({ points, days }: { points: TrendPoint[]; days: number }) {
  const [selectedKey, setSelectedKey] = useState(DEFAULT_SERIES.key)
  const pickerId = useId()

  const series = ALL_SERIES.find((option) => option.key === selectedKey) ?? DEFAULT_SERIES
  const runs = runsOf(points, series)
  const hasData = runs.length > 0

  const subtitle =
    days === 1 ? `${series.label}, dzisiaj` : `${series.label}, ostatnie ${days} dni`

  return (
    <section className="analysis-card">
      <h2>Zmiany samopoczucia w czasie</h2>
      <p className="analysis-card-subtitle">{subtitle}</p>

      {/* Outside the empty check on purpose: an emotion the window never rated
          draws nothing, and a picker that disappeared with the plot would leave
          the patient no way back to one that does. */}
      <div className="analysis-series-picker">
        <label htmlFor={pickerId}>Pokaż na wykresie</label>
        <select
          id={pickerId}
          value={series.key}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          <optgroup label="Poziomy">
            {LEVEL_SERIES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Emocje">
            {EMOTION_SERIES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {!hasData ? (
        /* "z ostatnich N dni", never "z tego okresu". The chart now covers the
           same window as the caption above it, so the two can no longer
           disagree about the period — but the sentence still names it, because
           this empty state is about one *series*: the window may hold plenty of
           entries and simply none that rated the emotion the picker is on. */
        <p className="analysis-empty">
          {days === 1
            ? `Dzisiejszy wpis nie ma oceny „${series.label.toLowerCase()}”.`
            : `Żaden wpis z ostatnich ${days} dni nie ma oceny „${series.label.toLowerCase()}”.`}
        </p>
      ) : (
        <>
          <svg
            className="analysis-line-chart"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            aria-label={`Wykres liniowy: ${subtitle.toLowerCase()}, w skali od 0 do ${LEVEL_SCALE_MAX}.`}
          >
            {AXIS_TICKS.map((value) => (
              <g key={value}>
                <line
                  className="analysis-line-grid"
                  x1={PADDING.left}
                  x2={PADDING.left + PLOT_WIDTH}
                  y1={yFor(value)}
                  y2={yFor(value)}
                />
                <text
                  className="analysis-line-axis"
                  x={PADDING.left - 6}
                  y={yFor(value)}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {value}
                </text>
              </g>
            ))}

            {/* Keyed on the series, so switching replaces the line rather than
                morphing the old one into it. */}
            <g key={series.key}>
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
                  r={dotRadius(points.length)}
                  fill={series.color}
                >
                  <title>{`${points[dot.index].dayLabel} — ${series.label.toLowerCase()} ${formatValue(dot.value)}`}</title>
                </circle>
              ))}
            </g>

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
            <span className="analysis-legend-item">
              <span className="analysis-legend-dot" style={{ backgroundColor: series.color }} />
              {series.label}
              <span className="analysis-legend-scale">skala 0–{LEVEL_SCALE_MAX}</span>
            </span>
          </div>
        </>
      )}
    </section>
  )
}

export default TrendChart
