import type { DietTechnique } from '../types/dietTechnique'

/**
 * The psychodietetic technique catalogue's content (§12).
 *
 * ── WHERE THE CONTENT COMES FROM ────────────────────────────────────────────
 * **It does not exist yet, and nothing below is content.** Both mockup sets say
 * so on the artboard: "Treść merytoryczną technik przygotowuje fundacja —
 * zespół dostarcza strukturę ekranu i sposób prezentacji kroków" and "Opisy i
 * kroki przygotowuje fundacja. Zespół projektowy dostarcza strukturę ekranu i
 * układ typograficzny." What is here is ten placeholders, written so that every
 * single field reads as a gap waiting to be filled and every one of them is
 * marked `zastepczy: true`.
 *
 * **THE PLACEHOLDERS ARE DELIBERATELY UNUSABLE, AND MUST STAY THAT WAY.** Same
 * rule as the invented phone numbers in `data/safetyPlan.ts`: do not "improve"
 * these into something that looks real. This is a health app used by people
 * with eating disorders; a row reading "Świadome jedzenie — pięć kroków" over
 * placeholder steps is a technique somebody may try before the foundation has
 * written a word of it. **Do not use the names from the mockup either** (skala
 * głodu i sytości, HALT, świadome jedzenie, technika odroczenia impulsu,
 * analiza wyzwalaczy, planowanie alternatywnych zachowań, ćwiczenia
 * samowspółczucia, trening akceptacji emocji, dziennik napadów objadania) —
 * a real name over a placeholder description looks like content missing only
 * its details, which is worse than an obviously empty slot.
 *
 * ── WHY IT IS HARDCODED ─────────────────────────────────────────────────────
 * There is no backend for this catalogue and none is planned in this change.
 * It lives in its own module rather than inside the screen so that moving the
 * source to a database later is **one import swap, not a rewrite of the
 * screen**: `import { DIET_TECHNIQUES } from '../data/dietTechniques'` becomes
 * a fetch, and `utils/dietTechniques.ts` keeps answering the same two questions
 * ("which ones are published", "which one is this id"). Nothing here is fetched,
 * so no screen in this module needs a loading or an error state for it.
 *
 * ── HOW TO REPLACE THIS WITH THE REAL THING ─────────────────────────────────
 * 1. Swap the strings inside an entry. Every field is a literal on purpose —
 *    there are no shared constants between entries, so editing one technique
 *    cannot silently edit another.
 * 2. Change the number of techniques by adding or deleting elements of
 *    `PLACEHOLDER_TECHNIQUES`. **Nothing counts them**: not the screens, not the
 *    types, not the tests. Ten is not a number this app knows.
 * 3. Set that entry's `zastepczy` to `false` in the same edit. That is what
 *    takes the notice off its own screen, and off the list once the last
 *    placeholder is gone. There is no global switch to remember — and there
 *    used to be one, `CONTENT_PENDING`, which had to come off at the first real
 *    technique and took the placeholder assertions away from every other entry
 *    with it. Nothing asks an entry to stay `zastepczy: true`.
 * 4. The order of the array is the order on screen. Nothing sorts it — the same
 *    arrangement as `data/crisisLines.ts`.
 *
 * ── HOW TO SEE THE EMPTY SCREEN ─────────────────────────────────────────────
 * Change the export at the bottom of this file from `PLACEHOLDER_TECHNIQUES` to
 * `[]`. That is the whole switch, and it is genuinely one line: the array is
 * exported precisely so it does not become an unused binding and fail
 * `npm run typecheck` (TS6133) the moment somebody flips it. Worth walking
 * through with the client, because the empty state is what a patient sees if
 * the foundation's content is late.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * What the list says while any of its entries is still a placeholder.
 *
 * Shown by `pages/DietTechniques.tsx` when `catalogueHasPlaceholders()` is
 * true, and gone by itself once the last `zastepczy` entry is filled in —
 * nobody has to remember to remove it.
 *
 * **"Część pozycji", not "poniższe pozycje".** The old wording was written when
 * a single flag meant all ten rows were placeholders at once; with the flag on
 * the entry the list can hold real techniques and unfinished ones side by side,
 * and a sentence claiming every row below is a placeholder would be false the
 * day the first real one lands. Which row is which is said on the row's own
 * screen — see PLACEHOLDER_NOTICE_TECHNIQUE.
 */
export const PLACEHOLDER_NOTICE_LIST =
  'Treść technik przygotowuje fundacja. Część pozycji na tej liście to miejsca na przyszłe opisy — nie są jeszcze ćwiczeniami do stosowania.'

/**
 * The same thing said about one technique, on its own screen.
 *
 * **A deep link is the whole reason this exists.** The address of a single
 * technique is exactly what gets copied, sent and pasted, and before this the
 * detail screen carried no mark of its own at all: everything that said "this
 * is not content yet" was the placeholder text itself, which stops being true
 * the moment somebody writes a plausible-looking name over it.
 */
export const PLACEHOLDER_NOTICE_TECHNIQUE =
  'Treść tej techniki przygotowuje fundacja. To, co widzisz poniżej, jest miejscem na przyszły opis — nie jest jeszcze ćwiczeniem do stosowania.'

/**
 * Ten placeholders.
 *
 * Every entry is `dostepnosc: 'ogolna'` and `opisGotowy: true`, and the second
 * one is the non-obvious part: **`false` would remove the row from the list and
 * from its own URL**, so a catalogue of "not ready yet" entries flagged as not
 * ready renders as an empty screen. `zastepczy` is what says the content is
 * pending; `opisGotowy` says whether a row exists at all.
 *
 * TODO(klientka): one technique from the mockup's list needs a decision before
 * it is written, and it is the reason `dostepnosc` exists on this type at all.
 * The design note on §12 of the first mockup set reads: "«Dziennik napadów
 * objadania» jest na liście technik, ale jego forma wymaga osobnej rozmowy —
 * dla części pacjentek prowadzenie takiego dziennika bywa objawem, nie
 * narzędziem. Proponujemy udostępniać go wyłącznie po ustaleniu ze
 * specjalistą." Setting `dostepnosc: 'wymagaSpecjalisty'` is how that is
 * expressed here — **but today a withheld technique disappears without a trace,
 * from the tabs and from its own URL alike** (`utils/dietTechniques.ts`,
 * `isPublished`), so a patient who was told about it by their dietitian and
 * typed the address gets "nie znaleziono". Whether that is the right behaviour
 * for this one technique — as opposed to a row that says it is introduced at a
 * visit, the way the psychotherapy catalogue names TIPP's "Temperatura" without
 * explaining it — is a question for the client, not for us. The psychotherapy
 * catalogue has the same open question (see `types/technique.ts`).
 */
export const PLACEHOLDER_TECHNIQUES: DietTechnique[] = [
  {
    id: 'technika-1',
    nazwa: 'Technika 1 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na trzeci krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    id: 'technika-2',
    nazwa: 'Technika 2 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    // The one entry with named steps, so that variant of the step list is
    // exercised by something other than a test fixture. The names are as
    // placeholder as everything else.
    id: 'technika-3',
    nazwa: 'Technika 3 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      {
        nazwa: 'Nazwa pierwszego kroku — do uzupełnienia',
        opis: 'Miejsce na opis pierwszego kroku. Treść przygotuje fundacja.',
      },
      {
        nazwa: 'Nazwa drugiego kroku — do uzupełnienia',
        opis: 'Miejsce na opis drugiego kroku. Treść przygotuje fundacja.',
      },
      {
        nazwa: 'Nazwa trzeciego kroku — do uzupełnienia',
        opis: 'Miejsce na opis trzeciego kroku. Treść przygotuje fundacja.',
      },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    // THE LETTERS ARE A LAYOUT DEMONSTRATION, NOT CONTENT. §12 draws one
    // technique whose circles hold letters rather than numbers, because the
    // technique is a mnemonic; `etykieta` is what covers that, and one entry
    // here uses it so the variant is visible on screen before any real
    // technique needs it. A, B, C spell nothing on purpose.
    id: 'technika-4',
    nazwa: 'Technika 4 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki. Kroki poniżej mają w kółkach litery zamiast numerów — tak makieta rysuje technikę, której nazwa jest skrótem. Treść przygotuje fundacja.',
    kroki: [
      { etykieta: 'A', opis: 'Miejsce na krok oznaczony literą. Treść przygotuje fundacja.' },
      { etykieta: 'B', opis: 'Miejsce na krok oznaczony literą. Treść przygotuje fundacja.' },
      { etykieta: 'C', opis: 'Miejsce na krok oznaczony literą. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    id: 'technika-5',
    nazwa: 'Technika 5 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    id: 'technika-6',
    nazwa: 'Technika 6 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na trzeci krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    id: 'technika-7',
    nazwa: 'Technika 7 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    id: 'technika-8',
    nazwa: 'Technika 8 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na trzeci krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    id: 'technika-9',
    nazwa: 'Technika 9 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
  {
    id: 'technika-10',
    nazwa: 'Technika 10 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie:
      'Miejsce na wprowadzenie do techniki — kilka zdań o tym, czemu służy i czego można się po niej spodziewać. Treść przygotuje fundacja.',
    kroki: [
      { opis: 'Miejsce na pierwszy krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na drugi krok. Treść przygotuje fundacja.' },
      { opis: 'Miejsce na trzeci krok. Treść przygotuje fundacja.' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
  },
]

/**
 * What the screens read. `[]` means the catalogue has nothing to show — see the
 * switch note at the top of this file.
 */
export const DIET_TECHNIQUES: DietTechnique[] = PLACEHOLDER_TECHNIQUES
