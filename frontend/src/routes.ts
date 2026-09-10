/** Every route path in one place, so a rename touches a single line instead of every menu/nav that links to it. */
export const ROUTES = {
  login: '/login',
  register: '/register',
  modules: '/modules',
  linkGuardian: '/link-guardian',
  /** Where an account whose RODO consents are not in force is held — the only
   *  screen it may reach. See pages/ConsentsRequired.tsx. */
  consents: '/consents',
  /** Where an account still holding a password somebody else generated for it
   *  is held — the only screen it may reach once its consents are in force.
   *  See pages/PasswordChangeRequired.tsx. */
  passwordChange: '/password-change',
  /** The guardian's own landing screen — see pages/ParentHome.tsx. */
  parentHome: '/parent',
  /** The specialist's landing screen — see pages/SpecialistHome.tsx. */
  specialistHome: '/specialist',
  /** One patient's weekly reports, read by their specialist. */
  specialistPatientReports: '/specialist/patients/:patientId/reports',
  specialistPatientReport: '/specialist/patients/:patientId/reports/:reportId',
  /** Where a specialist issues a code for a guardian's account. */
  specialistParentAccounts: '/specialist/parent-accounts',
  /** Where a specialist creates another specialist's account — the only place
   *  one can be created at all (see pages/SpecialistColleagues.tsx). */
  specialistColleagues: '/specialist/colleagues',
  /** The specialist's own techniques, and the form that writes one. */
  specialistTechniques: '/specialist/techniques',
  specialistTechniqueNew: '/specialist/techniques/new',
  specialistTechniqueEdit: '/specialist/techniques/:id/edit',
  home: '/home',
  journals: '/journals',
  journalDetail: '/journals/:id',
  diaryEntry: '/diary-entry',
  reports: '/reports',
  reportDetail: '/reports/:id',
  analysis: '/analysis',
  techniques: '/techniques',
  techniqueDetail: '/techniques/:id',
  profile: '/profile',
  safetyPlan: '/safety-plan',
  /** The diet module's own home screen — pages/DietHome.tsx. Until it was
   *  built this key pointed at a PlaceholderPage, which is why the module tile
   *  and the patient menu both already lead here. */
  diet: '/diet',
  /** "Dodawanie posiłku" (§04 of the mockups) — not built; the home screen's one
   *  action has to land somewhere real. */
  dietMeal: '/diet/meal',
  /** "Historia dzienniczków żywieniowych" (§07) — pages/DietJournals.tsx. */
  dietJournals: '/diet/journals',
  /** "Nawodnienie" — the first half of §08 of the mockups.
   *  pages/DietHydration.tsx, and the first screen in this module that had a
   *  backend behind it. */
  dietHydration: '/diet/hydration',
  /** "Suplementy i leki" — §08's second half, a screen of its own because the
   *  mockups make it one. pages/DietSupplements.tsx. */
  dietSupplements: '/diet/supplements',
  /** "Aktywność fizyczna i sen" (§09) — pages/DietActivitySleep.tsx. One route
   *  for both of §09's artboards: §03 gives the module's menu a single entry,
   *  and §09's own note says the two are reached from it, "w prototypie" by
   *  switching through the menu. A segmented switch on the screen is what that
   *  means in an app you cannot navigate away from and back. */
  dietActivitySleep: '/diet/activity-sleep',
} as const

/** Fills in ROUTES.journalDetail's `:id` param — use instead of building the path by hand. */
export function journalDetailPath(id: string): string {
  return ROUTES.journalDetail.replace(':id', id)
}

/** The same for ROUTES.reportDetail, whose `:id` is a week ('week-2026-08-03'). */
export function reportDetailPath(id: string): string {
  return ROUTES.reportDetail.replace(':id', id)
}

/** The same for ROUTES.techniqueDetail, whose `:id` is a technique slug ('tipp'). */
export function techniqueDetailPath(id: string): string {
  return ROUTES.techniqueDetail.replace(':id', id)
}

/** Fills in the two `:params` of a specialist's view of one patient's reports. */
export function specialistPatientReportsPath(patientId: string): string {
  return ROUTES.specialistPatientReports.replace(':patientId', patientId)
}

export function specialistPatientReportPath(patientId: string, reportId: string): string {
  return ROUTES.specialistPatientReport
    .replace(':patientId', patientId)
    .replace(':reportId', reportId)
}

export function specialistTechniqueEditPath(id: number | string): string {
  return ROUTES.specialistTechniqueEdit.replace(':id', String(id))
}

export interface PlaceholderRouteDef {
  path: string
  title: string
  /** Where "back" should lead; defaults to /home when omitted. */
  backTo?: string
  backLabel?: string
}

/** Screens the mockup references that aren't built yet — every link needs a destination. */
export const PLACEHOLDER_ROUTES: PlaceholderRouteDef[] = [
  {
    path: ROUTES.dietMeal,
    title: 'Dodawanie posiłku',
    backTo: ROUTES.diet,
    backLabel: '← Wróć do strony głównej dietetyki',
  },
]

/**
 * What each screen is called, for `document.title` and for the announcement a
 * screen reader hears on navigation.
 *
 * Keyed by route pattern rather than set inside each page: the announcement has
 * to happen when the URL changes, and a page's own effect runs after that — so
 * the announcer would be a step behind, naming the screen the user just left.
 */
export const ROUTE_TITLES: Record<string, string> = {
  [ROUTES.login]: 'Logowanie',
  [ROUTES.register]: 'Rejestracja',
  [ROUTES.linkGuardian]: 'Powiązanie z opiekunem',
  [ROUTES.consents]: 'Wymagane zgody',
  [ROUTES.passwordChange]: 'Ustaw własne hasło',
  [ROUTES.modules]: 'Wybór modułu',
  [ROUTES.parentHome]: 'Panel rodzica',
  [ROUTES.specialistHome]: 'Panel specjalisty',
  [ROUTES.specialistPatientReports]: 'Raporty pacjenta',
  [ROUTES.specialistPatientReport]: 'Raport tygodniowy pacjenta',
  [ROUTES.specialistParentAccounts]: 'Konta opiekunów',
  [ROUTES.specialistColleagues]: 'Konta specjalistów',
  [ROUTES.specialistTechniques]: 'Moje techniki',
  [ROUTES.specialistTechniqueNew]: 'Nowa technika',
  [ROUTES.specialistTechniqueEdit]: 'Edycja techniki',
  [ROUTES.diet]: 'Dietetyka i psychodietetyka',
  [ROUTES.dietJournals]: 'Dzienniczki żywieniowe',
  [ROUTES.dietHydration]: 'Nawodnienie',
  [ROUTES.dietSupplements]: 'Suplementy i leki',
  /* §03's own name for the menu entry, kept verbatim. */
  [ROUTES.dietActivitySleep]: 'Aktywność i sen',
  [ROUTES.home]: 'Strona główna',
  [ROUTES.journals]: 'Dzienniczki',
  [ROUTES.journalDetail]: 'Wpis w dzienniczku',
  [ROUTES.diaryEntry]: 'Dodaj wpis',
  [ROUTES.reports]: 'Raporty',
  [ROUTES.reportDetail]: 'Raport tygodniowy',
  [ROUTES.analysis]: 'Analiza',
  [ROUTES.techniques]: 'Techniki terapeutyczne',
  [ROUTES.techniqueDetail]: 'Technika terapeutyczna',
  [ROUTES.profile]: 'Profil',
  [ROUTES.safetyPlan]: 'Plan bezpieczeństwa',
  ...Object.fromEntries(PLACEHOLDER_ROUTES.map((route) => [route.path, route.title])),
}

/**
 * A screen's name, for a menu entry that should not repeat a title already
 * written down.
 *
 * Reads ROUTE_TITLES rather than PLACEHOLDER_ROUTES, so an entry keeps its label
 * when the screen behind it stops being a placeholder and moves into the real
 * route table — which is exactly what happened to "Analiza".
 */
export function routeTitle(path: string): string {
  return ROUTE_TITLES[path] ?? path
}

/** Shown after the screen name, so a browser tab says what app it belongs to. */
export const APP_NAME = 'Mediculus'
