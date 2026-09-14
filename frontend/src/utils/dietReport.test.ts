import { describe, expect, it } from 'vitest'
import { MEAL_SLOT_UNSPECIFIED, mealSlotLabel } from './dietReport'
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
