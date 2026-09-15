import { DIFFICULTY_GRADIENT, HEATMAP_MIN_DAYS, difficultyColor } from '../utils/analysis'
import { LEVEL_SCALE_MAX, formatNumber } from '../utils/reports'
import WeekdayTimeHeatmap, { type HeatmapReading } from './WeekdayTimeHeatmap'
import type { AnalysisHeatmap } from '../types/analysis'

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
 * THE GRID ITSELF NOW LIVES IN `components/WeekdayTimeHeatmap.tsx`, which the
 * diet module's "Analiza" draws as well. This file is what makes that grid mean
 * *difficulty*: the ramp, the sentence a cell reads out, the caption, the
 * legend's two ends and the paragraph underneath. Everything this component
 * renders is what it rendered before the split — the props it takes, the markup
 * that comes out and the wording are unchanged, which is why `pages/Analysis.tsx`
 * and its tests did not have to move with it.
 */
function EmotionHeatmap({ heatmap }: { heatmap: AnalysisHeatmap }) {
  const readings: HeatmapReading[] = heatmap.cells.map((cell) => ({
    weekday: cell.weekday,
    timeOfDay: cell.timeOfDay,
    // null when no rated entry landed here — drawn as an outline rather than as
    // the ramp's lightest colour, so "nothing here" cannot be misread as "easy
    // here".
    value: cell.difficulty,
  }))

  return (
    <WeekdayTimeHeatmap
      readings={readings}
      unlocked={heatmap.unlocked}
      lockedText="Wzorce tygodniowe pojawią się, gdy zbierze się więcej wpisów z zaznaczoną porą dnia."
      caption={`Średnia trudność dnia według dnia tygodnia i pory dnia, w skali od 0 do ${LEVEL_SCALE_MAX}.`}
      // Never null: a mean difficulty is comparable with the next cell however
      // many entries it rests on, so there is no square this map withholds a
      // shade from. `value` is non-null here by the component's own contract —
      // it calls `color` only for a cell it has a reading for.
      color={(reading) => difficultyColor(reading.value ?? 0)}
      describe={(reading) =>
        reading === null
          ? 'brak wpisu'
          : `trudność ${formatNumber(reading.value ?? 0, 1)} / ${LEVEL_SCALE_MAX}`
      }
      legend={{ gradient: DIFFICULTY_GRADIENT, from: 'łatwiej', to: 'trudniej' }}
      note={
        <>
          Kolor pokazuje, jak trudne bywały wpisy z danego dnia i pory. Puste pola to godziny, o
          których nic jeszcze nie zapisałeś/zapisałaś — mapa buduje się z co najmniej{' '}
          {HEATMAP_MIN_DAYS} dni z zaznaczoną porą dnia.
        </>
      }
    />
  )
}

export default EmotionHeatmap
