/**
 * One psychodietetic technique, as "Techniki psychodietetyczne" (§12) shows it.
 *
 * WHY THIS IS NOT `types/technique.ts`. The psychotherapy catalogue's type is
 * built around DBT: `szkola: TechniqueSchool[]` ('dbt' | 'cbt' |
 * 'relaksacyjne'), `grupa: TechniqueGroup` (four groups ordered by time
 * horizon) and `modulDBT`. Reusing it here would carry all three into a module
 * that has no schools, no groups and no DBT — both of the client's mockup sets
 * say this list is flat ("lista bez kategorii", "dziewięć pozycji na jednej
 * liście, w stałej kolejności"), so those fields would exist only to be left
 * `undefined`, and the first person to notice them would reasonably start
 * filling them in. Two catalogues, two types, one shared vocabulary of two
 * words (see `DietTechniqueAvailability`).
 *
 * Field names are Polish without diacritics (`dostepnosc`, `czasTrwania`,
 * `zastepczy`), the same convention as `types/technique.ts`: the catalogue's
 * vocabulary is Polish, but an identifier should be typeable on any keyboard.
 */

/**
 * Whether the technique belongs in a self-service catalogue at all.
 *
 * **The same two literals as `TechniqueAvailability` in `types/technique.ts`,
 * declared again rather than imported**, and the duplication is the point: the
 * import would drag `TechniqueSchool` and the DBT vocabulary in behind it (see
 * the note at the top). The values are also `AVAILABILITY_GENERAL` /
 * `AVAILABILITY_SPECIALIST` in `backend/core/technique_vocabulary.py`, so if
 * this catalogue ever gets a backend it speaks the same two words as the other
 * one. Read in exactly one place — `utils/dietTechniques.ts`, `isPublished`.
 */
export type DietTechniqueAvailability = 'ogolna' | 'wymagaSpecjalisty'

/** One numbered step of a technique. */
export interface DietTechniqueStep {
  /**
   * The step's own name, where it has one ("Zatrzymaj się", "H — Hungry").
   *
   * Optional: a technique written as plain instructions has steps with a
   * description and nothing else, and inventing a heading for those would be
   * adding content.
   */
  nazwa?: string
  /** The instruction itself. Newlines are meaningful (`white-space: pre-line`). */
  opis: string
  /**
   * What goes in the step's circle instead of its number.
   *
   * §12 draws both variants: the detailed mockup numbers the four steps 1-4,
   * the other set puts the letters H / A / L / T there, because the technique
   * *is* the mnemonic. One optional field covers both, so a technique of the
   * second kind is a data decision rather than a second step component. A step
   * with no `etykieta` is numbered by its position, which is what
   * `DietTechniqueStepList` does by default.
   *
   * Keep it to one or two characters: the circle is 26px.
   */
  etykieta?: string
}

export interface DietTechnique {
  /** Stable slug, used in the URL (`/diet/techniques/:id`). Written by hand. */
  id: string
  nazwa: string
  /**
   * How long it takes, **as text rather than as a number of minutes**.
   *
   * The two mockup sets disagree about what belongs here — one draws "2
   * minuty", the other "3 – 5 minut" — and a range is not a number. A `number`
   * field would also force whoever fills this catalogue in to invent a single
   * figure where the foundation's material may honestly say "kilka minut". The
   * screen prints this string as it stands and never does arithmetic on it.
   */
  czasTrwania: string
  /** When to reach for it ("przed jedzeniem", "po trudnym dniu"). Printed as written. */
  momentZastosowania: string
  /** The paragraph above "Kroki". */
  wprowadzenie: string
  kroki: DietTechniqueStep[]
  dostepnosc: DietTechniqueAvailability
  /**
   * Whether the technique has a description yet.
   *
   * The same gate as the psychotherapy catalogue's `opisGotowy`: a name can be
   * recorded here ahead of its content without becoming a row that opens an
   * empty screen. Both this and `dostepnosc` are read by `isPublished` in
   * `utils/dietTechniques.ts` and nowhere else.
   */
  opisGotowy: boolean
  /**
   * Whether the text above is a placeholder rather than the technique itself.
   *
   * **PER ENTRY, AND REQUIRED, AND THAT IS THE WHOLE POINT.** This replaced a
   * single `CONTENT_PENDING` flag on the data module, which turned out to be a
   * switch nobody could throw honestly: the tests that keep a placeholder
   * reading *as* a placeholder hung off that flag, so the first real technique
   * forced it off and took the guard away from the nine entries still waiting.
   * A flag on the entry cannot do that — the notice, and the assertions, follow
   * the entry that is actually unfinished.
   *
   * Required rather than optional (`zastepczy?: boolean`) so that adding a
   * technique is a decision rather than an omission: a new placeholder that
   * forgot the field would otherwise ship as content, silently, which is the
   * one failure this module exists to prevent. `false` is what real content
   * says, and nothing in the app asks a technique to stay `true`.
   *
   * Read by `catalogueHasPlaceholders` in `utils/dietTechniques.ts` (the list's
   * notice) and by `pages/DietTechniqueDetail.tsx` (the same notice on one
   * technique, so a deep link cannot open an unmarked screen).
   */
  zastepczy: boolean
}
