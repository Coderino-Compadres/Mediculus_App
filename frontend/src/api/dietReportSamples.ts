/**
 * A filled diet diary, for looking at the report screens.
 *
 * **NOT WIRED TO ANYTHING.** `loadDietReports` in api/diet.ts answers with
 * `emptyDietReportSource()`; this file exists so the filled state can be looked
 * at in a browser and tested, and switching to it is one line there, described
 * in a comment at the switch. Exactly the arrangement `sampleActivityDay` and
 * `sampleSleepNight` already use, and for the same reason: a screen a patient
 * sees must never show anything they did not write, but a screen nobody can
 * fill in is a screen nobody reviews.
 *
 * TWO RULES THIS FILE KEEPS.
 *
 * **Nothing is copied from the mockup.** Not a figure, not a sentence. The
 * artboards' own sample data ("6 z 7 dni", "31 posiłków zapisanych", "Po
 * rozmowach telefonicznych (2)") is what a reviewer would mistake for something
 * the app computed — the same mistake the home screen's technique card made
 * when the only names it could ever show were three rows out of
 * `mock_data.sql`. Everything below is written for this file.
 *
 * **Everything is dated relative to the day it is asked for**, so the sample
 * never quietly becomes a stale fixed month. Pass an earlier `today` to see
 * fewer weeks.
 *
 * The shape of the fortnight is deliberate rather than uniform, because the
 * interesting states are the ragged ones and a tidy sample hides every one of
 * them: a day with nothing on it at all, a meal with no hour, a meal with no
 * kind, a meal saved with no description, a meal after 23:00 (the bucket the
 * mockup's own time bands would have dropped), days with no water, a night
 * that answers only half its questions, and a day whose step count was never
 * typed.
 */

import { addDays, toIsoDate } from '../utils/days'
import type { DietReportSource } from '../types/dietReport'
import type {
  DietActivityDay,
  DietJournalDay,
  DietSleepNight,
  HydrationDayTotal,
} from '../types/diet'

/**
 * How far back the sample diary reaches.
 *
 * Twenty-five days is three whole weeks plus a few days of the running one —
 * enough for a list with several rows *and* for the running week to be visibly
 * left out, which is the rule most worth being able to see.
 */
const SAMPLE_SPAN_DAYS = 25

/** A day with nothing at all on it, so the history has a gap in it — every
 *  real diary does, and a report has to render one calmly. */
const BLANK_DAY = 3

interface SampleMeal {
  kind: string | null
  time: string | null
  description: string
}

/**
 * What one day's meals look like, by the day's position in the week.
 *
 * Six shapes rather than one, so every branch §05 allows is reachable from a
 * seed: the day with an unhoured meal, the day with an unnamed one, the day
 * with a meal saved without a description, and the late-night one.
 */
const MEALS_BY_WEEKDAY: readonly SampleMeal[][] = [
  [
    { kind: 'Śniadanie', time: '07:30', description: 'Owsianka na mleku, do tego jabłko.' },
    { kind: 'Obiad', time: '13:40', description: 'Ryż z warzywami, zjedzone w pracy.' },
    { kind: 'Kolacja', time: '19:10', description: 'Kanapki z serem.' },
  ],
  [
    { kind: 'Śniadanie', time: '08:05', description: 'Jajecznica na dwóch jajkach.' },
    { kind: 'Przekąska', time: '16:20', description: 'Garść orzechów w drodze do domu.' },
    { kind: 'Kolacja', time: '20:00', description: '' },
  ],
  [
    // No kind: the picker was skipped, which §05 allows outright.
    { kind: null, time: '09:15', description: 'Coś na szybko przed wyjściem.' },
    { kind: 'Obiad', time: '14:30', description: 'Zupa jarzynowa i pieczywo.' },
  ],
  [],
  [
    { kind: 'Śniadanie', time: '07:50', description: 'Kasza jaglana z owocami.' },
    { kind: 'Obiad', time: '13:00', description: 'Makaron z sosem pomidorowym.' },
    // After 22:00 — the slot the mockup's own time bands would have dropped.
    { kind: 'Przekąska', time: '23:40', description: 'Jogurt, już po położeniu się.' },
  ],
  [
    // No hour: the clock was left alone, and the meal is still a meal.
    { kind: 'Obiad', time: null, description: 'Obiad u rodziców, nie pamiętam godziny.' },
    { kind: 'Kolacja', time: '18:45', description: 'Sałatka z tuńczykiem.' },
  ],
  [
    { kind: 'Śniadanie', time: '10:20', description: 'Późne śniadanie, naleśniki.' },
    { kind: 'Podwieczorek', time: '17:00', description: 'Herbata i dwa ciastka.' },
    { kind: 'Kolacja', time: '20:30', description: 'Resztki z obiadu.' },
  ],
]

/** Millilitres of water per day, by position in the week. Some days under a
 *  six-glass day and some over it — the goal is a point of reference, and a
 *  sample that always met it would make the screen look like it rewards that.
 *  A zero is a day nobody recorded a drink on, not a day nobody drank. */
const WATER_ML_BY_WEEKDAY = [1500, 1750, 0, 0, 2000, 750, 1250]

const ACTIVITY_BY_WEEKDAY: readonly {
  time: string
  kind: string | null
  kindOther: string
  durationMinutes: number | null
  feelingAfter: DietActivityDay['entries'][number]['feelingAfter']
}[][] = [
  [{ time: '18:10', kind: 'Spacer', kindOther: '', durationMinutes: 40, feelingAfter: 'better' }],
  [],
  [{ time: '07:05', kind: 'Joga', kindOther: '', durationMinutes: 20, feelingAfter: 'neutral' }],
  [],
  [
    { time: '17:30', kind: 'Rower', kindOther: '', durationMinutes: 55, feelingAfter: 'better' },
    // "Inne" plus its own text, the pair `activityKindLabel` collapses.
    { time: '21:00', kind: 'Inne', kindOther: 'Sprzątanie', durationMinutes: null, feelingAfter: 'worse' },
  ],
  [],
  [{ time: '11:40', kind: 'Basen', kindOther: '', durationMinutes: 45, feelingAfter: 'better' }],
]

/** Null on some days: a step count is copied off a phone when somebody feels
 *  like it, and null is not zero. The last of the seven is the state worth
 *  being able to look at — a day that holds a real activity *and* no step
 *  count, so the report has to render "Kroki: nie wpisano" beside something
 *  rather than leaving the whole row out. */
const STEPS_BY_WEEKDAY: readonly (number | null)[] = [7200, null, 4100, null, 9050, null, null]

const SLEEP_BY_WEEKDAY: readonly Omit<DietSleepNight, 'date'>[] = [
  { fellAsleepAt: '23:10', wokeUpAt: '06:40', quality: 4, awakenings: 0, wakeFeeling: 'rested' },
  { fellAsleepAt: '00:20', wokeUpAt: '07:00', quality: 2, awakenings: 2, wakeFeeling: 'heavy' },
  // Half-answered: the hours went in and the rest did not.
  { fellAsleepAt: '22:50', wokeUpAt: null, quality: null, awakenings: 0, wakeFeeling: null },
  { fellAsleepAt: '23:40', wokeUpAt: '06:15', quality: 3, awakenings: 1, wakeFeeling: 'calm' },
  { fellAsleepAt: '23:00', wokeUpAt: '05:50', quality: 3, awakenings: 0, wakeFeeling: 'tense' },
  { fellAsleepAt: '01:10', wokeUpAt: '08:30', quality: 2, awakenings: 3, wakeFeeling: 'heavy' },
  { fellAsleepAt: '22:30', wokeUpAt: '06:00', quality: 5, awakenings: 0, wakeFeeling: 'rested' },
]

/**
 * A diary reaching back three-and-a-bit weeks from `today`.
 *
 * `today` itself is included, which is what makes the running week visible in
 * the data and absent from the list — the property worth being able to check
 * by eye.
 */
export function sampleDietReportSource(today: Date = new Date()): DietReportSource {
  const meals: DietJournalDay[] = []
  const hydration: HydrationDayTotal[] = []
  const activity: DietActivityDay[] = []
  const sleep: DietSleepNight[] = []

  for (let offset = SAMPLE_SPAN_DAYS; offset >= 0; offset -= 1) {
    const date = toIsoDate(addDays(today, -offset))
    // Counted from the oldest day, so the shape of a week stays put as the
    // sample is asked for on different days.
    const position = (SAMPLE_SPAN_DAYS - offset) % 7

    if (position === BLANK_DAY) continue

    const dayMeals = MEALS_BY_WEEKDAY[position]
    if (dayMeals.length > 0) {
      meals.push({
        date,
        meals: dayMeals.map((meal, index) => ({
          id: `sample-meal-${date}-${index}`,
          kind: meal.kind,
          time: meal.time,
          description: meal.description,
        })),
      })
    }

    const waterMl = WATER_ML_BY_WEEKDAY[position]
    if (waterMl > 0) {
      // The glass is 250 ml on the server (`core/drinks.py`); the figure is
      // rounded to one decimal there, and the same arithmetic here keeps the
      // sample honest rather than picking a rounder number.
      hydration.push({ date, waterMl, glasses: Math.round((waterMl / 250) * 10) / 10 })
    }

    const entries = ACTIVITY_BY_WEEKDAY[position]
    const steps = STEPS_BY_WEEKDAY[position]
    if (entries.length > 0 || steps !== null) {
      activity.push({
        date,
        steps,
        entries: entries.map((entry, index) => ({
          id: `sample-activity-${date}-${index}`,
          date,
          ...entry,
        })),
      })
    }

    sleep.push({ date, ...SLEEP_BY_WEEKDAY[position] })
  }

  return { meals, hydration, activity, sleep }
}
