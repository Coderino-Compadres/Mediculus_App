import type { SafetyPlan } from '../types/safetyPlan'

/**
 * The safety plan a specialist prepared for this patient.
 *
 * Frontend-only for now: there is no endpoint, no table and no write path. It
 * lives here rather than inside the screen so that connecting the backend is a
 * change of import — `import { SAFETY_PLAN } from '../data/safetyPlan'` becomes a
 * fetch — and not a rewrite of `pages/SafetyPlan.tsx`.
 *
 * WHO WRITES THIS. Not the patient. The plan is "przygotowany wspólnie z
 * terapeutą", and the specialist panel carries "przygotowywać indywidualny plan
 * bezpieczeństwa" as its own item. In the patient app this document is read-only,
 * which is why there is no form anywhere on that screen and no draft type in
 * `types/safetyPlan.ts`.
 *
 * WHAT IS DELIBERATELY NOT HERE. A classic Stanley-Brown safety plan includes a
 * "means restriction" step — asking the person to list the ways they could hurt
 * themselves so the environment can be secured. That step belongs in a
 * consulting room with a clinician present. This is a self-service app, used by
 * minors, that says of itself that it is not a crisis tool; prompting somebody to
 * enumerate methods here would be actively harmful. If a specialist judges it
 * necessary for a particular patient, they write it in their own words under
 * `recommendations`.
 *
 * ── HOW TO SHOW THE EMPTY STATE ─────────────────────────────────────────────
 * Change the export at the bottom of this file from `EXAMPLE_PLAN` to `null`.
 * That is the whole switch — and it is genuinely one line: `EXAMPLE_PLAN` is
 * exported precisely so that it does not become an unused binding and fail
 * `npm run typecheck` (TS6133) the moment somebody flips it. Both states are
 * worth walking through with the
 * client, because THE EMPTY ONE IS THE DEFAULT once this is real: most patients
 * will not have a plan, since a specialist has to sit down and write one first.
 * The screen is designed around that — the support numbers stay fully visible
 * with no plan at all, so it is useful to an account that has nothing.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * EXAMPLE DATA. Every name and number below is invented and is meant to read as
 * invented.
 *
 * The phone numbers are all-zeroes rather than realistic. A plausible-looking
 * number in demo data eventually gets dialled from a demo device, and it rings
 * somebody who never agreed to be anybody's emergency contact — on a screen about
 * a crisis, that is the worst call this app could place. Do not "improve" these
 * into something that looks real, and do not put a real person's name here.
 *
 * The content itself follows the confirmed field order, warning signs first.
 *
 * Exported rather than file-local so that switching `SAFETY_PLAN` to `null` does
 * not leave it unreferenced — see the switch note above. Nothing else imports it
 * today; that is fine and is the point.
 */
export const EXAMPLE_PLAN: SafetyPlan = {
  warningSigns: [
    'Nie śpię dłużej niż dwie noce z rzędu',
    'Odwołuję spotkania, na które wcześniej się cieszyłam',
    'Przestaję odpisywać na wiadomości',
    'Wracają myśli, że jestem ciężarem dla innych',
  ],
  copingStrategies: [
    'Wyjść na spacer, choćby na dziesięć minut',
    'Zadzwonić do siostry, nawet bez konkretnego powodu',
    'Miarowe oddychanie — wdech na cztery, wydech na sześć',
    'Napisać w dzienniczku, co się dzieje, zanim podejmę jakąkolwiek decyzję',
  ],
  trustedPeople: [
    // EXAMPLE DATA — first names only and all-zero numbers, on purpose.
    { id: 'trusted-1', name: 'Ania', relation: 'siostra', phone: { dial: '000000000', display: '000 000 000' } },
    { id: 'trusted-2', name: 'Kasia', relation: 'przyjaciółka', phone: { dial: '000000000', display: '000 000 000' } },
  ],
  // null in the ordinary case: the treating specialist reaches this screen from
  // `PROFILE_CARE` (src/data/profile.ts), the same source the profile's "Opieka"
  // card reads. This field is only for a contact the specialist wrote in
  // *instead* — a GP or a psychiatrist outside the foundation.
  alternativeContact: null,
  recommendations:
    'Jeśli zauważysz u siebie dwa sygnały z powyższej listy naraz, napisz do mnie ' +
    'wiadomość jeszcze przed umówioną wizytą — nie czekaj do czwartku. ' +
    'W nocy najlepiej sprawdza się Centrum Wsparcia; nie musisz dzwonić z konkretną sprawą.',
  updatedAt: '2026-08-11',
}

/**
 * What the screen renders. `null` means no specialist has written a plan for this
 * account — see the switch note at the top of this file.
 */
export const SAFETY_PLAN: SafetyPlan | null = EXAMPLE_PLAN
