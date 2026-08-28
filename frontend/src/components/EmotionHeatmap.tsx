import { DIFFICULTY_GRADIENT, HEATMAP_MIN_DAYS, WEEKDAYS, difficultyColor } from '../utils/analysis'
import { LEVEL_SCALE_MAX, formatNumber } from '../utils/reports'
import { TIME_OF_DAY_OPTIONS } from '../utils/timeOfDay'
import type { AnalysisHeatmap, HeatmapCell } from '../types/analysis'

/**
 * "Kiedy jest trudniej" — weekday × part of the day, coloured by how hard the
 * entries that landed in each cell were.
 *
 * The vertical axis is the entry's own *pora dnia* answer (utils/timeOfDay.ts),
 * never `savedAt`: that timestamp is the moment somebody pressed "Zapisz", and a
 * morning panic attack written up at eleven at night would land in the wrong row
 * every time. Entries that left the question blank are simply not on the map —
 * the field is optional, so that is a normal answer rather than a gap to fill in
 * with a guess.
 *
 * Below HEATMAP_MIN_DAYS the grid is not drawn at all; see the constant for why.
 *
 * A <table> rather than a grid of divs: the axes *are* row and column headers,
 * and this way a screen reader announces "Wieczór, poniedziałek" on a cell for
 * free instead of reading 28 unlabelled boxes.
 */

/** The cells, keyed for lookup — `cells` arrives in a fixed order, but reading it
 *  positionally would tie this component to that order. */
function cellIndex(cells: HeatmapCell[]): Map<string, HeatmapCell> {
  return new Map(cells.map((cell) => [`${cell.weekday}:${cell.timeOfDay}`, cell]))
}

function EmotionHeatmap({ heatmap }: { heatmap: AnalysisHeatmap }) {
  if (!heatmap.unlocked) {
    return (
      <p className="analysis-locked">
        Wzorce tygodniowe pojawią się, gdy zbierze się więcej wpisów z zaznaczoną porą dnia.
      </p>
    )
  }

  const cells = cellIndex(heatmap.cells)

  return (
    <>
      <div className="analysis-heatmap-scroll">
        <table className="analysis-heatmap">
          <caption className="visually-hidden">
            Średnia trudność dnia według dnia tygodnia i pory dnia, w skali od 0 do {LEVEL_SCALE_MAX}.
          </caption>
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
                  const cell = cells.get(`${index}:${option.value}`)
                  const difficulty = cell?.difficulty ?? null
                  const reading =
                    difficulty === null
                      ? 'brak wpisu'
                      : `trudność ${formatNumber(difficulty, 1)} / ${LEVEL_SCALE_MAX}`

                  return (
                    <td key={weekday.short}>
                      <span
                        className={
                          difficulty === null
                            ? 'analysis-heat-cell analysis-heat-cell-empty'
                            : 'analysis-heat-cell'
                        }
                        style={
                          difficulty === null
                            ? undefined
                            : { backgroundColor: difficultyColor(difficulty) }
                        }
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
        <span>łatwiej</span>
        <span className="analysis-heat-legend-bar" style={{ backgroundImage: DIFFICULTY_GRADIENT }} />
        <span>trudniej</span>
      </div>
      <p className="analysis-note">
        Kolor pokazuje, jak trudne bywały wpisy z danego dnia i pory. Puste pola to godziny, o
        których nic jeszcze nie zapisałeś/zapisałaś — mapa buduje się z co najmniej{' '}
        {HEATMAP_MIN_DAYS} dni z zaznaczoną porą dnia.
      </p>
    </>
  )
}

export default EmotionHeatmap
