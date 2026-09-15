import { emotionTint } from '../utils/emotions'
import type { DietEmotionCross } from '../types/dietAnalysis'
import './charts.css'

/**
 * An emotion crossed with something else — when a feeling came up, at which
 * meals, in which week.
 *
 * ONE COMPONENT FOR ALL THREE of §11's emotion crossings. They differ only in
 * what the columns are (`utils/dietAnalysis.ts` builds the shape), and three
 * bespoke tables would be three places for the same misreading to be introduced
 * independently — and three places to fix it.
 *
 * A TABLE RATHER THAN A CHART, on purpose. The cell's own number is the
 * reading; the colour is a way of finding the dark end of a row with the eye,
 * not the message. That ordering is what §11 asks for in its own words —
 * "wykres pokazuje, kiedy coś się działo, i nie dopisuje, co to znaczy" — and a
 * table is also the one shape that survives a screen reader without a parallel
 * text version, because a cell already has a row header and a column header.
 *
 * **THE SHADE IS RELATIVE TO ITS OWN ROW AND NEVER TO THE TABLE.** A row is one
 * emotion, and the question it answers is "when does this come up" — so the
 * denominator is that emotion's own biggest cell. Shaded against the whole
 * table instead, the emotions with the most meals would simply be the darkest
 * rows, which is the ranking above restated in colour rather than anything new;
 * and the columns are not comparable in size anyway (a window holds many more
 * suppers than midnight snacks, and more meals in a full week than in the
 * clipped one at the end). The note under the table has to keep saying this,
 * because a coloured grid invites exactly the comparison it does not support.
 *
 * **THREE KINDS OF BLANK, AND THEY ARE DIFFERENT CLAIMS**, the same discipline
 * the heat map one card up is built on:
 *
 * - a column with no meal at all — nothing is known about that part of the day,
 *   that kind of meal or that week. Drawn as "—", read out as "brak posiłków".
 * - a cell of 0 in a column that *does* hold meals — a measurement: meals
 *   happened then and none of them carried this emotion. Drawn as a plain 0.
 * - an emotion never picked in the window has no row at all, rather than a row
 *   of zeroes. Absence is what "not felt" looks like here; a row of noughts
 *   would read as a question the patient answered with "no".
 */
function EmotionCrossTable({
  cross,
  caption,
}: {
  cross: DietEmotionCross
  /** The visually hidden `<caption>` — what the table is of. */
  caption: string
}) {
  return (
    <div className="emotion-cross-scroll">
      <table className="emotion-cross">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Emocja</span>
            </th>
            {cross.columns.map((column) => (
              <th key={column.key} scope="col" title={column.hint}>
                <span aria-hidden="true">{column.label}</span>
                {/* The hint carries what the label cannot — a week's dates. It
                    is appended rather than replacing the label, so the spoken
                    heading is "Tyg. 3, 26 sierpnia – 1 września" and still
                    matches what is on screen. */}
                <span className="visually-hidden">
                  {column.hint ? `${column.label}, ${column.hint}` : column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cross.rows.map((row) => {
            /* The row's own denominator. Guarded against zero, though a row only
               exists because the emotion was picked at least once, so the guard
               is for the type rather than for a case that can arise. */
            const busiest = Math.max(...row.cells.map((cell) => cell.meals), 1)

            return (
              <tr key={row.emotion}>
                <th scope="row">
                  {/* The dot carries the emotion's colour so the row can be
                      matched with the bars above it; the name carries the
                      meaning, because colour on its own is not a message. */}
                  <span
                    className="emotion-cross-dot"
                    style={{ backgroundColor: emotionTint(row.emotion, 1) }}
                    aria-hidden="true"
                  />
                  {row.emotion}
                </th>
                {row.cells.map((cell) => {
                  const column = cross.columns.find((entry) => entry.key === cell.column)
                  const unmeasured = (column?.meals ?? 0) === 0

                  return (
                    <td
                      key={cell.column}
                      className={unmeasured ? 'emotion-cross-cell-empty' : undefined}
                      style={
                        unmeasured
                          ? undefined
                          : { backgroundColor: emotionTint(row.emotion, cell.meals / busiest) }
                      }
                    >
                      {/* The count on its own. A screen reader already has the
                          row and the column from the two headers, so spelling
                          out "1 posiłek" in every cell would read the same
                          noun sixty times across one table. The dash is the
                          exception: it is punctuation and has to be said in
                          words. */}
                      {unmeasured ? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="visually-hidden">brak posiłków</span>
                        </>
                      ) : (
                        cell.meals
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default EmotionCrossTable
