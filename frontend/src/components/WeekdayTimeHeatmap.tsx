import type { ReactNode } from 'react'
import { WEEKDAYS } from '../utils/analysis'
import { TIME_OF_DAY_OPTIONS, type TimeOfDay } from '../utils/timeOfDay'
import './charts.css'

/**
 * A weekday × part-of-the-day grid, coloured by whatever the caller measures.
 *
 * WHY IT IS GENERIC. This is `components/EmotionHeatmap.tsx` with the
 * psychotherapy half taken out. That component drew a 7 × 4 grid of the
 * *average difficulty* of diary entries; the diet module's "Analiza" needs the
 * same 7 × 4 grid, the same axes and — this is the part worth sharing — the
 * same accessibility, to show *how many days held a meal*. Two readings with
 * nothing in common but their shape, so the shape is what lives here and the
 * meaning arrives in props: the ramp, the sentence each cell reads out, the
 * caption, the legend's two ends, the paragraph underneath and what to say
 * while the grid is still locked.
 *
 * `EmotionHeatmap` is now a four-line adapter over this, with its own props and
 * its own rendered output unchanged — `pages/Analysis.tsx` did not have to be
 * touched and neither did its tests.
 *
 * A <table> rather than a grid of divs, which is the whole reason this was
 * worth sharing rather than copying: the axes *are* row and column headers, and
 * this way a screen reader announces "Wieczór, poniedziałek" on a cell for free
 * instead of reading 28 unlabelled boxes. The colour is the entire visible
 * content of a cell, so the reading has to reach assistive tech some other way —
 * hence the visually-hidden span in every one of them.
 *
 * NOTHING HERE DECIDES WHAT IS WORTH DRAWING. `unlocked` is the caller's
 * judgement, because the threshold that makes a grid honest is a question about
 * the data behind it (see HEATMAP_MIN_DAYS in utils/analysis.ts and
 * DIET_HEATMAP_MIN_DAYS in utils/dietAnalysis.ts, which answer it differently
 * for different reasons). The same goes one cell down: `color` returning null is
 * the caller withholding a shade from a square that rests on too little
 * (DIET_HEATMAP_MIN_WEEKDAY_DAYS), and this component only draws the withholding
 * — it never works out that there is too little.
 */

export interface HeatmapReading {
  /** 0 = Monday, matching WEEKDAYS. */
  weekday: number
  timeOfDay: TimeOfDay
  /**
   * What this cell measures, or null when there is nothing to measure.
   *
   * null draws an outlined cell and never the pale end of the ramp: "nothing
   * here" must not be readable as "a little here". A genuine zero is a value
   * like any other and gets its colour.
   */
  value: number | null
  /**
   * How many observations `value` was counted out of, when the caller counts one
   * thing out of another; undefined when it does not.
   *
   * The psychotherapy map leaves it out: its cell is a mean difficulty, which
   * rests on however many entries it rests on and is comparable with the next
   * cell regardless. The diet map cannot — its cell counts days of one weekday,
   * and weekdays do not occur equally often inside a thirty-day window, so the
   * count means nothing without the count it came out of. Carried here rather
   * than folded into `value` by the caller because both numbers are read out
   * separately (see `describe`), and because the ratio the caller may build from
   * them must never reach the reader as one.
   */
  observations?: number
}

export interface HeatmapLegend {
  /** A CSS gradient built from the same ramp as the cells, so the legend cannot
   *  drift from the map it explains. */
  gradient: string
  /** What the pale end means, then what the deep end means. */
  from: string
  to: string
}

interface WeekdayTimeHeatmapProps {
  readings: HeatmapReading[]
  /** False while there is too little behind the grid to draw it at all. */
  unlocked: boolean
  /** One sentence saying what is still missing. No progress bar, no percentage. */
  lockedText: string
  /** The visually-hidden <caption>: what the grid is a grid of. */
  caption: string
  /**
   * The cell's colour, or **null for a cell the caller will not shade** — a
   * reading that exists but rests on too little to put on a ramp.
   *
   * That third answer is why this takes the whole reading rather than a number:
   * whether a cell can be shaded is a question about what is behind it
   * (`observations`), not about its value. A caller with nothing to withhold —
   * the psychotherapy map — never returns null, and renders exactly as before.
   */
  color: (reading: HeatmapReading) => string | null
  /** The cell's reading, for the tooltip and for assistive tech. `null` is the
   *  cell nothing is known about at all. */
  describe: (reading: HeatmapReading | null) => string
  legend: HeatmapLegend
  note: ReactNode
}

/** The cells, keyed for lookup — `readings` arrives in a fixed order, but
 *  reading it positionally would tie this component to that order. */
function readingIndex(readings: HeatmapReading[]): Map<string, HeatmapReading> {
  return new Map(readings.map((reading) => [`${reading.weekday}:${reading.timeOfDay}`, reading]))
}

function WeekdayTimeHeatmap({
  readings,
  unlocked,
  lockedText,
  caption,
  color,
  describe,
  legend,
  note,
}: WeekdayTimeHeatmapProps) {
  if (!unlocked) {
    return <p className="analysis-locked">{lockedText}</p>
  }

  const cells = readingIndex(readings)

  return (
    <>
      <div className="analysis-heatmap-scroll">
        <table className="analysis-heatmap">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <td />
              {WEEKDAYS.map((weekday) => (
                <th key={weekday.short} scope="col">
                  <span aria-hidden="true">{weekday.short}</span>
                  <span className="visually-hidden">{weekday.full}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_OF_DAY_OPTIONS.map((option) => (
              <tr key={option.value}>
                <th scope="row">{option.label}</th>
                {WEEKDAYS.map((weekday, index) => {
                  const cell = cells.get(`${index}:${option.value}`) ?? null
                  const value = cell?.value ?? null
                  // Three outcomes, not two: no reading at all, a reading the
                  // caller declines to shade, and a shaded one.
                  const shade = cell === null || value === null ? null : color(cell)
                  const reading = describe(value === null ? null : cell)

                  return (
                    <td key={weekday.short}>
                      <span
                        className={
                          value === null
                            ? 'analysis-heat-cell analysis-heat-cell-empty'
                            : shade === null
                              ? 'analysis-heat-cell analysis-heat-cell-sparse'
                              : 'analysis-heat-cell'
                        }
                        style={shade === null ? undefined : { backgroundColor: shade }}
                        title={`${weekday.full}, ${option.label.toLowerCase()}: ${reading}`}
                      />
                      {/* The colour is the whole content of the cell, so the
                          reading has to reach assistive tech some other way. */}
                      <span className="visually-hidden">{reading}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="analysis-heat-legend" aria-hidden="true">
        <span>{legend.from}</span>
        <span className="analysis-heat-legend-bar" style={{ backgroundImage: legend.gradient }} />
        <span>{legend.to}</span>
      </div>
      <p className="analysis-note">{note}</p>
    </>
  )
}

export default WeekdayTimeHeatmap
