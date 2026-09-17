import { DIET_TECHNIQUES } from '../data/dietTechniques'
import type { DietTechnique } from '../types/dietTechnique'

/**
 * The three questions both screens of §12 ask of the catalogue.
 *
 * They live here rather than in the screens for the reason the gate below
 * exists at all: the list and the detail have to agree about which techniques a
 * patient may read, and two copies of that rule are two things to correct. The
 * data module is imported once, here, so replacing it with a fetch later is a
 * change to this file and to nothing else.
 */

/**
 * Whether a technique may appear in the self-service catalogue at all.
 *
 * Two conditions, and both are gates rather than filters — the same shape as
 * `isPublished` in `utils/techniques.ts`:
 *   - `opisGotowy`, so a technique whose name is known before its description
 *     arrives can sit in the data without becoming a row that opens an empty
 *     screen;
 *   - `dostepnosc === 'ogolna'`. Nothing is flagged 'wymagaSpecjalisty' today,
 *     so this changes no screen — but if setting it did not actually withhold
 *     the technique it would be a safety flag that silently does nothing. See
 *     the TODO(klientka) in `data/dietTechniques.ts` for the one technique this
 *     is waiting for.
 *
 * **Read in one place**, so a technique flagged later disappears from the list
 * AND from its own URL at once. A gate a URL can walk around is not a gate.
 */
function isPublished(technique: DietTechnique): boolean {
  return technique.opisGotowy && technique.dostepnosc === 'ogolna'
}

/**
 * Every published technique, in the order the data file lists them.
 *
 * Nothing sorts and nothing counts: the array's order is the screen's order
 * (like `data/crisisLines.ts`), and how many there are is whatever the data
 * says. No screen, type or test in this module knows the number.
 */
export function publishedDietTechniques(): DietTechnique[] {
  return DIET_TECHNIQUES.filter(isPublished)
}

/** One technique by id — the same gate as the list, so a URL cannot bypass it. */
export function findDietTechnique(id: string | undefined): DietTechnique | undefined {
  return DIET_TECHNIQUES.find((technique) => technique.id === id && isPublished(technique))
}

/**
 * Whether anything a patient can open is still a placeholder.
 *
 * This is what puts the notice on the list and what takes it off again, and it
 * asks the entries rather than a flag on the module — so the sentence is true
 * by construction and stops appearing on its own, in the same edit that fills
 * the last placeholder in. `CONTENT_PENDING` used to answer this, and the
 * trouble with it is in `types/dietTechnique.ts` under `zastepczy`.
 *
 * **Asks `publishedDietTechniques()`, not the raw data**: a placeholder that is
 * withheld (`opisGotowy: false`, or a technique a specialist has to introduce)
 * is on no screen, so it is not something the list should be apologising for.
 */
export function catalogueHasPlaceholders(): boolean {
  return publishedDietTechniques().some((technique) => technique.zastepczy)
}
