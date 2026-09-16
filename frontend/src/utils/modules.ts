/**
 * The two modules, as a value the API carries.
 *
 * The app has had two modules since `/diet` was built, and until the specialist
 * panel gained them that fact lived only in the routes: a prefix in
 * `core/urls.py`, a pair of menus in `components/HeaderMenu.tsx`, and a comment.
 * `specjalist_patient.module` is the first value that names one, because who
 * treats a patient is now a question with one answer *per module* — a
 * psychotherapist and a psychodietitian are two relationships with one person.
 *
 * DECLARED A SECOND TIME HERE, AND PINNED. `core/modules.py` is the other copy;
 * the wire carries these keys and this file holds the Polish labels the screens
 * print, the same arrangement as `utils/emotions.ts` and `utils/timeOfDay.ts`.
 * `modules.test.ts` reads the Python and asserts the two agree — value for
 * value and label for label — because the one failure mode that matters is a
 * silent disagreement: a module the backend refuses (`ChoiceField`) or a card
 * labelled with a key.
 */

/** The psychotherapy module: the diary, its weekly reports, the DBT catalogue. */
export const MODULE_PSYCHOTHERAPY = 'psychotherapy'

/** "Dietetyka i psychodietetyka": the food diary, water, activity, sleep. */
export const MODULE_DIET = 'diet'

/** Every module a relationship may name, in the order the app presents them. */
export const MODULES = [MODULE_PSYCHOTHERAPY, MODULE_DIET] as const

export type AppModule = (typeof MODULES)[number]

/**
 * What each is called on screen.
 *
 * The names the patient already picks between on `/modules`
 * (pages/ModuleSelect.tsx), rather than a second set invented for the panel:
 * somebody agreeing to be treated in a module should read the same words they
 * read when they chose it, and a specialist should see the words their patient
 * sees.
 */
export const MODULE_LABELS: Record<AppModule, string> = {
  [MODULE_PSYCHOTHERAPY]: 'Psychoterapia',
  [MODULE_DIET]: 'Dietetyka i psychodietetyka',
}

/**
 * A shorter name, for a badge sitting next to a patient's name.
 *
 * "Dietetyka i psychodietetyka" is the module's full name and it is right on a
 * tile the patient taps; on a chip beside a row in a list it wraps to three
 * lines and pushes the name it labels off the card. The full label stays
 * available and is what the invitation card uses, where there is room and where
 * the exact wording is what somebody is agreeing to.
 */
export const MODULE_SHORT_LABELS: Record<AppModule, string> = {
  [MODULE_PSYCHOTHERAPY]: 'Psychoterapia',
  [MODULE_DIET]: 'Dietetyka',
}

/** The screen name of a module, or the raw value for one nothing knows. */
export function moduleLabel(module: string): string {
  return MODULE_LABELS[module as AppModule] ?? module
}

export function moduleShortLabel(module: string): string {
  return MODULE_SHORT_LABELS[module as AppModule] ?? module
}

/** Whether a value off the wire is a module this build knows about. */
export function isAppModule(value: unknown): value is AppModule {
  return typeof value === 'string' && (MODULES as readonly string[]).includes(value)
}
