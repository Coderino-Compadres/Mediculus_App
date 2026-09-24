import type { ROUTES } from '../routes'

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

/**
 * A path from `routes.ts`, and nothing else.
 *
 * `typeof ROUTES[keyof typeof ROUTES]` rather than `string`, and the difference
 * is the whole point of the field that uses it: a link written as a literal
 * ('/diet/journals') keeps compiling after somebody renames the route, and then
 * fails at runtime as a 404 nobody tested. Written this way, the rename breaks
 * the build instead. `import type` keeps this module free of a runtime import —
 * it is a type file, and nothing here should end up in the bundle.
 */
type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

/**
 * A link from a technique to the screen where the app already does the thing
 * the technique describes.
 *
 * THREE TECHNIQUES HAVE THESE AND THE REST DO NOT, on purpose. The client's
 * text names a food diary (5), an emotion diary (6) and self-monitoring (12) —
 * activities this app already offers a screen for, so a patient reading
 * "Zapisuj: godzinę, co i ile jesz…" should not have to go looking for the form
 * that does it. The other twelve techniques are done away from the phone, and a
 * link on them would be an invitation to open the app instead of doing the
 * exercise.
 *
 * **THE LINK IS DATA, NOT PROSE.** It is deliberately not woven into a step's
 * text: the steps are the client's words and she will send corrections to them,
 * the route is ours and changes when the app changes. Keeping them apart means
 * a correction to her text never touches a route, and a route rename never
 * edits her text.
 */
export interface DietTechniqueLink {
  /**
   * Where it goes — a `ROUTES` constant, never a literal (see `RoutePath`).
   *
   * A route with a `:param` in it will not work here: nothing fills one in, and
   * the link would navigate to the pattern. Pinned by a test in
   * `data/dietTechniques.test.ts`.
   */
  trasa: RoutePath
  /**
   * What the link says.
   *
   * **A CROSS-MODULE LINK HAS TO SAY SO IN THE LABEL.** The emotion diary lives
   * in the psychotherapy half of the app; following the link swaps the menu and
   * the nadtytuł over a patient's head, which is exactly the surprise
   * `HeaderMenu`'s own "Przejdź do części psychoterapeutycznej" exists to avoid.
   * Same wording here, for the same reason — one app, one way of announcing
   * that you are leaving half of it.
   */
  etykieta: string
}

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
   *
   * **OPTIONAL, AND EVERY TECHNIQUE THE CLIENT SENT LEAVES IT OUT.** Her file
   * gives fifteen techniques and not one duration; "3 min · przed jedzeniem" on
   * the artboard is the designers' own invention, the same case as the
   * psychotherapy catalogue, which deliberately shows no time either. A
   * required field here would have to be filled with a number nobody measured,
   * on a screen read by people with eating disorders — so it is optional, the
   * list draws its meta line only when there is something to put in it, and the
   * detail draws the chip only for the field that exists. See the
   * TODO(klientka) in `data/dietTechniques.ts`.
   */
  czasTrwania?: string
  /**
   * When to reach for it ("przed jedzeniem", "po trudnym dniu"). Printed as written.
   *
   * Optional for exactly the reason `czasTrwania` is, and empty for the same
   * reason: the client's file names no moment for any of the fifteen.
   */
  momentZastosowania?: string
  /** The paragraph above "Kroki". */
  wprowadzenie: string
  kroki: DietTechniqueStep[]
  /**
   * A sentence that closes the thought the steps open, where the author wrote one.
   *
   * TWO OF THE FIFTEEN HAVE ONE, and before this field existed both were forced
   * to be steps — which is where the field comes from. It read badly in two
   * distinct ways and both were on screen:
   *   - HALT's four circles hold H, A, L and T because the technique *is* the
   *     mnemonic; her closing sentence became a fifth step and the circle beside
   *     it read "5", so the screen spelled "H A L T 5".
   *   - The food diary lists seven things to write down, and her caveat ("Nie
   *     służy on do oceniania ani karania się…") became the eighth — a warning
   *     numbered among the things to record, as though it were one of them.
   *
   * ── WHAT BELONGS HERE, AND IT IS NOT A QUESTION OF POSITION ────────────────
   * **The test is "does this sentence close a thought, or is it an instruction?"
   * — never "does it come after the list?".** Three techniques are written as
   * lead-in, list, then one more sentence, and only two of them are notes:
   *   - HALT: "Jeśli nie odczuwasz głodu fizycznego, zastanów się…" — what to do
   *     when the answer is no. A note.
   *   - The food diary: "Nie służy on do oceniania…" — what the diary is not
   *     for. A note.
   *   - The hunger scale: "Przed posiłkiem oceń swój głód, a po posiłku – poziom
   *     sytości." — **a step**, and the only instruction in that technique,
   *     because everything above it is a scale to read off rather than a thing
   *     to do. It was a `notka` briefly and it was wrong: the "Kroki" card was
   *     left without a verb in it and the one thing the patient is asked to do
   *     sat below a rule, greyed out, where this screen puts asides.
   * The sorting was done sentence by sentence across all fifteen; going by shape
   * alone would put that third one back here. `data/dietTechniques.ts` carries
   * the same warning on the entry itself.
   *
   * NOT A STEP, AND NOT A WARNING EITHER. It renders as a paragraph under the
   * step list inside the same card, set apart from the steps but carrying
   * neither the module's ochre nor an icon: it closes the thought the steps
   * open, and dressing it as a caution would tell a reader something the author
   * did not.
   *
   * **It is the last thing in her "Jak wykonać", so it renders last.** A note
   * moved up into `wprowadzenie` would read before the steps it comments on,
   * which inverts her order — the same reason `przyklad` is not folded upwards.
   */
  notka?: string
  /**
   * The technique's worked example — "Przykład: …", the last paragraph of every
   * one of the client's fifteen.
   *
   * ITS OWN FIELD RATHER THAN A LAST STEP OR A TAIL ON THE INTRODUCTION, and
   * the reason is that it is neither. An example is not something you do, so
   * numbering it inside the `<ol>` tells a reader to perform it; and it is
   * written to be read *after* the steps, so moving it up into `wprowadzenie`
   * inverts the order the author wrote in. It gets its own card at the foot of
   * the detail screen, under a heading of its own.
   *
   * Optional because the field is newer than the type and a technique may
   * arrive without one — the card appears and disappears with it.
   */
  przyklad?: string
  /**
   * Where in the app this technique is actually carried out, if anywhere.
   *
   * **AT MOST TWO, AND ONLY WHERE THE APP GENUINELY HAS THE SCREEN.** See
   * `DietTechniqueLink` for why these are data rather than prose, and
   * `data/dietTechniques.ts` for which three techniques carry them and what was
   * rejected.
   */
  odsylacze?: DietTechniqueLink[]
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
