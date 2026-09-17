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
  /** The same pair for the **diet** module, read by the patient's
   *  psychodietitian. Their own routes rather than a module segment on the two
   *  above, mirroring the split the patient's own screens already have: the two
   *  modules do not agree on what a week is, so one screen holding both would
   *  be one screen with two meanings of the word. */
  specialistPatientDietReports: '/specialist/patients/:patientId/diet-reports',
  specialistPatientDietReport: '/specialist/patients/:patientId/diet-reports/:reportId',
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
  /** "Dodawanie posiłku" (§04) — pages/DietMealForm.tsx. The module's primary
   *  action, and until §04 was built it pointed at a PlaceholderPage, which is
   *  why the home screen and the history's empty state both already lead here. */
  dietMeal: '/diet/meal',
  /** Correcting one of today's meals — pages/DietMealForm.tsx again, in edit
   *  mode. Its own URL rather than an inline form on the home screen, so the
   *  rules about what a meal may hold have one definition; §04's form already
   *  carries them. Only today's meals can be reached: the backend refuses an
   *  older one, and no screen offers the link. */
  dietMealEdit: '/diet/meal/:id',
  /** "Historia dzienniczków żywieniowych" (§07) — pages/DietJournals.tsx. */
  dietJournals: '/diet/journals',
  /** One day of that history, opened out — pages/DietJournalDay.tsx. Keyed by
   *  the calendar day rather than by an id, because a *dzienniczek* in this
   *  module **is** a day: there is no `diet_day` row to name. Read-only, like
   *  `journalDetail`; today is edited on the module's home screen. */
  dietJournalDay: '/diet/journals/:date',
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
  /** "Raporty" (§10) — the diet module's own weekly reports.
   *
   *  Its own pair of routes rather than a reuse of `/reports`, and the reason
   *  is not tidiness: the two modules do not agree on what a week is. The
   *  psychotherapy report covers a Monday-Sunday week (`core/reports.py`
   *  `start_of_week`); this one covers seven days counted from the patient's
   *  first entry, which is what both of the client's mockup sets say and what
   *  she said out loud ("jeśli dzienniczki są rozpoczęte od wtorku, to do
   *  następnego wtorku"). Nothing here touches the psychotherapy half. */
  dietReports: '/diet/reports',
  dietReportDetail: '/diet/reports/:id',
  /** "Analiza" (§11) — the diet module's own, and its own route for the same
   *  reason `dietReports` is: the two modules read different diaries over
   *  different windows, and nothing here touches `/analysis`. See
   *  pages/DietAnalysis.tsx for what §11 asks for that cannot be drawn yet. */
  dietAnalysis: '/diet/analysis',
  /** "Techniki psychodietetyczne" (§12) — pages/DietTechniques.tsx and
   *  pages/DietTechniqueDetail.tsx.
   *
   *  ITS OWN PAIR OF ROUTES RATHER THAN A REUSE OF `/techniques`, and this one
   *  is not even close: the psychotherapy catalogue is DBT material organised
   *  into three schools and four groups, this is nine-ish psychodietetic
   *  exercises on one flat list. They share a word and nothing else — no
   *  content, no type (`types/dietTechnique.ts` says why), no data file and no
   *  backend. `/techniques` is also the one patient screen a specialist is let
   *  onto; these are ordinary /diet screens and let nobody extra in. */
  dietTechniques: '/diet/techniques',
  dietTechniqueDetail: '/diet/techniques/:id',
  /** "Profil zdrowotny" (§13) — pages/DietProfile.tsx.
   *
   *  ITS OWN ROUTE RATHER THAN A REUSE OF `/profile`, and the reason is the
   *  same shape as `dietReports` above without being the same reason. Both
   *  mockup sets say the profile is shared between the modules, and the team
   *  decided otherwise: two screens, one set of account data. The middle of
   *  this screen (mass, height, conditions, the way somebody eats) has no
   *  business on a psychotherapy profile, and `/profile`'s middle — the diary
   *  counters, the "Terapeuta" row — has none here.
   *
   *  What is NOT duplicated is everything the two genuinely share: identity,
   *  the consent register, the e-mail and password forms and signing out are
   *  the same components on both screens, not a copy (see
   *  components/profileForms.css). A second implementation of "withdraw a
   *  consent" is a second thing that can be wrong about a right. */
  dietProfile: '/diet/profile',
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

/** The same for ROUTES.dietReportDetail, whose `:id` is also a week
 *  ('week-2026-09-01') — the id names the week's *first* day, which in this
 *  module is rarely a Monday. See utils/dietWeeks.ts. */
export function dietReportDetailPath(id: string): string {
  return ROUTES.dietReportDetail.replace(':id', id)
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

/** The same two, for the diet module's copy of those screens. */
export function specialistPatientDietReportsPath(patientId: string): string {
  return ROUTES.specialistPatientDietReports.replace(':patientId', patientId)
}

export function specialistPatientDietReportPath(
  patientId: string,
  reportId: string,
): string {
  return ROUTES.specialistPatientDietReport
    .replace(':patientId', patientId)
    .replace(':reportId', reportId)
}

export function specialistTechniqueEditPath(id: number | string): string {
  return ROUTES.specialistTechniqueEdit.replace(':id', String(id))
}

/** The same for ROUTES.dietTechniqueDetail, whose `:id` is a technique slug
 *  ('technika-1'). Hand-written in `data/dietTechniques.ts`, same slug shape as
 *  the psychotherapy catalogue's. */
export function dietTechniqueDetailPath(id: string): string {
  return ROUTES.dietTechniqueDetail.replace(':id', id)
}

export function dietMealEditPath(id: string): string {
  return ROUTES.dietMealEdit.replace(':id', id)
}

/** `date` is 'YYYY-MM-DD', the shape `utils/days.ts` writes and the API reads. */
export function dietJournalDayPath(date: string): string {
  return ROUTES.dietJournalDay.replace(':date', date)
}

export interface PlaceholderRouteDef {
  path: string
  title: string
  /** Where "back" should lead; defaults to /home when omitted. */
  backTo?: string
  backLabel?: string
}

/** Screens the mockup references that aren't built yet — every link needs a
 *  destination.
 *
 *  **Empty, and that is the state to keep it in.** Its last entry was
 *  `dietMeal`, §04's form, which is now a real screen. An entry here is a link
 *  that goes nowhere; adding one is fine while a screen is genuinely pending,
 *  but it should leave again with the screen rather than outlive it. `App.tsx`
 *  maps over this list, so an empty one renders nothing. */
export const PLACEHOLDER_ROUTES: PlaceholderRouteDef[] = []

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
  [ROUTES.specialistPatientDietReports]: 'Raporty żywieniowe pacjenta',
  [ROUTES.specialistPatientDietReport]: 'Raport żywieniowy pacjenta',
  [ROUTES.specialistParentAccounts]: 'Konta opiekunów',
  [ROUTES.specialistColleagues]: 'Konta specjalistów',
  [ROUTES.specialistTechniques]: 'Moje techniki',
  [ROUTES.specialistTechniqueNew]: 'Nowa technika',
  [ROUTES.specialistTechniqueEdit]: 'Edycja techniki',
  [ROUTES.diet]: 'Dietetyka i psychodietetyka',
  [ROUTES.dietMeal]: 'Dodawanie posiłku',
  [ROUTES.dietMealEdit]: 'Edycja posiłku',
  [ROUTES.dietJournals]: 'Dzienniczki żywieniowe',
  [ROUTES.dietJournalDay]: 'Dzienniczek dnia',
  [ROUTES.dietHydration]: 'Nawodnienie',
  [ROUTES.dietSupplements]: 'Suplementy i leki',
  /* §03's own name for the menu entry, kept verbatim. */
  [ROUTES.dietActivitySleep]: 'Aktywność i sen',
  /* The same two words the psychotherapy module uses, deliberately. The titles
     are keyed by path, the two menus are separate lists picked by route
     (`HeaderMenu.isDietRoute`), and a patient inside "DIETETYKA I
     PSYCHODIETETYKA" reading "Raporty" is reading the right word — renaming
     one of them to keep a map's values unique would be inventing a label to
     satisfy a data structure. */
  [ROUTES.dietReports]: 'Raporty',
  [ROUTES.dietReportDetail]: 'Raport tygodniowy',
  /* The same word as the psychotherapy screen, for the same reason "Raporty" is
     repeated above: the titles are keyed by path, the two menus are separate
     lists picked by route, and a patient inside "DIETETYKA I PSYCHODIETETYKA"
     reading "Analiza" is reading the right word. */
  [ROUTES.dietAnalysis]: 'Analiza',
  /* "Techniki", not "Techniki psychodietetyczne": §03 draws the menu entry with
     the short word, and this key is what both the menu and the document title
     read. The <h1> on the screen itself says the long name.

     THIS IS THE ONE SCREEN IN THE MODULE WHERE THE TWO DIFFER, and an earlier
     version of this comment justified that by pointing at §13 — wrongly, as it
     happens: pages/DietProfile.tsx renders <h1>Profil</h1>, the same short word
     as its menu entry, and so do Raporty and Analiza. The real reason is that
     "Techniki" alone is ambiguous in a way the other three are not — the app has
     a second catalogue by that name — so the screen names itself in full while
     the menu, where the module is already the heading, keeps the short word §03
     draws. The psychotherapy catalogue's entry is "Techniki terapeutyczne", so
     the two menus do not collide either. */
  [ROUTES.dietTechniques]: 'Techniki',
  [ROUTES.dietTechniqueDetail]: 'Technika psychodietetyczna',
  /* The same word as the psychotherapy screen, for the third time in this map
     and for the same reason "Raporty" and "Analiza" are repeated above: the
     titles are keyed by path, the two menus are separate lists picked by
     route, and a patient inside "DIETETYKA I PSYCHODIETETYKA" reading "Profil"
     is reading the right word. The artboard calls the screen "Profil
     zdrowotny"; the menu entry it draws says "Profil", and this key is what
     both the menu and the document title read. */
  [ROUTES.dietProfile]: 'Profil',
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
