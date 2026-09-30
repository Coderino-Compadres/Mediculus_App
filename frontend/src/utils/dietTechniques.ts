import { DIET_TECHNIQUES } from '../data/dietTechniques'
import type { DietTechnique } from '../types/dietTechnique'

/**
 * The three questions both screens of §12 ask of the catalogue.
 *
 * They live here rather than in the screens for the reason the gate below
 * exists at all: the list and the detail have to agree about which techniques a
 * patient may read, and two copies of that rule are two things to correct. The
 * data module is imported once, here; the techniques psychodietitians wrote
 * arrive as the `stored` argument (see `hooks/useStoredDietTechniques.ts`).
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
 * The whole catalogue: the techniques the app ships with, then the ones
 * psychodietitians wrote (`stored`, from `useStoredDietTechniques`).
 *
 * The client's own fifteen come first and in her order; a technique added from
 * the panel follows, in the order the API sent them. A slug in both halves
 * keeps the built-in one — the backend refuses that collision anyway, so this
 * is a backstop that fails towards her text. `stored` defaults to empty, so a
 * screen or test that does not load it behaves as before.
 */
function catalogue(stored: DietTechnique[] = []): DietTechnique[] {
  const builtinIds = new Set(DIET_TECHNIQUES.map((technique) => technique.id))
  return [
    ...DIET_TECHNIQUES,
    ...stored.filter((technique) => !builtinIds.has(technique.id)),
  ]
}

/**
 * Every published technique, in catalogue order.
 *
 * Nothing sorts and nothing counts: the array's order is the screen's order
 * (like `data/crisisLines.ts`), and how many there are is whatever the data
 * says. No screen, type or test in this module knows the number.
 */
export function publishedDietTechniques(stored: DietTechnique[] = []): DietTechnique[] {
  return catalogue(stored).filter(isPublished)
}

/** One technique by id — the same gate as the list, so a URL cannot bypass it. */
export function findDietTechnique(
  id: string | undefined,
  stored: DietTechnique[] = [],
): DietTechnique | undefined {
  return catalogue(stored).find((technique) => technique.id === id && isPublished(technique))
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
 * A stored technique is never a placeholder, so the built-in half is enough.
 */
export function catalogueHasPlaceholders(): boolean {
  return publishedDietTechniques().some((technique) => technique.zastepczy)
}
