import { describe, expect, it } from 'vitest'
import {
  MEAL_SLOT_UNSPECIFIED,
  byAverageDescending,
  emotionRatingNote,
  mealSlotLabel,
} from './dietReport'
import { TIME_OF_DAY_LABELS, TIME_OF_DAY_VALUES } from './timeOfDay'

/**
 * What is left of this file after the report moved to the server.
 *
 * **MOST OF WHAT WAS TESTED HERE IS NOW TESTED IN PYTHON.** `buildDietReports`,
 * `firstEntryDate`, `mealSlot` and the meal grid live in `core/diet_reports.py`,
 * and `backend/core/tests/test_diet_reports_api.py` covers them — including the
 * cases this file used to own: the week counted from the first entry rather
 * than from a Monday, the week in progress being left out, a day with no water
 * being null rather than zero, and the night that wraps midnight landing in the
 * `night` column instead of being dropped the way the artboard's own bands
 * would have dropped it.
 *
 * That is the point of having moved it: one definition, on one clock, producing
 * one document. Duplicating those assertions here would be duplicating them
 * against a second implementation that no longer exists.
 *
 * What a payload cannot carry is a Polish label, so that is what is left.
 */

describe('mealSlotLabel', () => {
  it('gives the four times of day the app\'s own words', () => {
    // Shared with the psychotherapy module's "pora dnia" chip, so "Rano" means
    // the same word in both. The values travel from the server; only the
    // wording is this file's.
    for (const slot of TIME_OF_DAY_VALUES) {
      expect(mealSlotLabel(slot)).toBe(TIME_OF_DAY_LABELS[slot])
    }
  })

  it('heads the fifth column for meals saved without an hour', () => {
    /**
     * Not a time of day, so it has no entry in TIME_OF_DAY_LABELS and the
     * label switches on it. A meal with no hour is an ordinary entry (§05,
     * "żadne pole nie blokuje zapisu"), so the grid owes it a heading that says
     * so plainly rather than guessing it into a slot or dropping it.
     */
    expect(mealSlotLabel(MEAL_SLOT_UNSPECIFIED)).toBe('Bez godziny')
  })

  it('names no column in a way that counts or grades anything', () => {
    const labels = [
      ...TIME_OF_DAY_VALUES.map(mealSlotLabel),
      mealSlotLabel(MEAL_SLOT_UNSPECIFIED),
    ]

    for (const label of labels) {
      for (const forbidden of ['kcal', 'kalor', 'suma', 'razem', 'cel', '%']) {
        expect(label.toLowerCase()).not.toContain(forbidden)
      }
    }
  })
})

/**
 * The caveat under a row of "Najczęstsze emocje przy jedzeniu".
 *
 * **A CHIP CAN BE PICKED WITHOUT BEING RATED**, which is what
 * `diet_meal_emotion.intensity` is nullable for, and this sentence is the only
 * thing standing between that fact and a row that quietly overstates what it
 * knows. A row reading "7 posiłków · śr. 6,5 / 10" may be averaging five
 * numbers; unsaid, that is a precision nobody entered, shown to a patient and
 * possibly read over her shoulder by her specialist.
 */
describe('emotionRatingNote', () => {
  it('says nothing when every picking was also rated', () => {
    // The common case. A note on every row would train the eye to skip the ones
    // that carry a real caveat.
    expect(emotionRatingNote({ meals: 4, ratedMeals: 4 })).toBeNull()
    expect(emotionRatingNote({ meals: 1, ratedMeals: 1 })).toBeNull()
  })

  it('says how many meals the average actually rests on', () => {
    const note = emotionRatingNote({ meals: 7, ratedMeals: 5 })

    expect(note).toBe('Średnia z 5 posiłków; przy 2 posiłkach natężenie nie zostało ocenione.')
  })

  it('explains the missing average when nothing was rated at all', () => {
    /* Without this the row looks like a bug — "why has this one no number?" —
       rather than like the ordinary answer it is: §05's rule is that no field
       blocks a save. */
    expect(emotionRatingNote({ meals: 3, ratedMeals: 0 })).toBe(
      'Natężenie nie zostało ocenione — emocja została tylko zaznaczona.',
    )
  })

  it('declines "posiłek" for both prepositions it uses', () => {
    /* "z … posiłków" is genitive and "przy … posiłkach" locative; `pluralMeals`'
       nominative fits neither, which is why utils/meals.ts holds three forms.
       One is singular and the other is not, and the two cases disagree about
       where that boundary falls. */
    expect(emotionRatingNote({ meals: 2, ratedMeals: 1 })).toBe(
      'Średnia z 1 posiłku; przy 1 posiłku natężenie nie zostało ocenione.',
    )
    expect(emotionRatingNote({ meals: 6, ratedMeals: 2 })).toBe(
      'Średnia z 2 posiłków; przy 4 posiłkach natężenie nie zostało ocenione.',
    )
  })

  it('never calls the meal itself unrated', () => {
    /* "bez oceny" next to a meal reads as a verdict withheld on the food, which
       is exactly what this module is built not to pass. The word has to stay
       attached to "natężenie". */
    for (const row of [{ meals: 5, ratedMeals: 2 }, { meals: 5, ratedMeals: 0 }]) {
      const note = emotionRatingNote(row)
      // Case-insensitively: one of the two sentences opens with the word.
      expect(note?.toLowerCase()).toContain('natężenie')
      expect(note).not.toMatch(/ocena posiłku|nieoceniony|bez oceny posiłku/i)
    }
  })
})

describe('byAverageDescending', () => {
  it('puts the highest average first and an unrated chip last, keeping ties in order', () => {
    const rows = [
      { label: 'Smutek', average: 2 },
      { label: 'Wstyd', average: null },
      { label: 'Złość', average: 8.5 },
      { label: 'Spokój', average: 2 },
      { label: 'Lęk' },
    ]

    expect([...rows].sort(byAverageDescending).map((row) => row.label)).toEqual([
      'Złość', 'Smutek', 'Spokój', 'Wstyd', 'Lęk',
    ])
  })
})
