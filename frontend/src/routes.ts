/** Every route path in one place, so a rename touches a single line instead of every menu/nav that links to it. */
export const ROUTES = {
  login: '/login',
  register: '/register',
  modules: '/modules',
  linkGuardian: '/link-guardian',
  /** Where an account whose RODO consents are not in force is held — the only
   *  screen it may reach. See pages/ConsentsRequired.tsx. */
  consents: '/consents',
  /** The guardian's own landing screen — see pages/ParentHome.tsx. */
  parentHome: '/parent',
  /** The specialist's landing screen — see pages/SpecialistHome.tsx. */
  specialistHome: '/specialist',
  /** One patient's weekly reports, read by their specialist. */
  specialistPatientReports: '/specialist/patients/:patientId/reports',
  specialistPatientReport: '/specialist/patients/:patientId/reports/:reportId',
  /** Where a specialist issues a code for a guardian's account. */
  specialistParentAccounts: '/specialist/parent-accounts',
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
  diet: '/diet-placeholder',
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
    path: ROUTES.diet,
    title: 'Dietetyka i psychodietetyka',
    backTo: ROUTES.modules,
    backLabel: '← Wróć do wyboru modułu',
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
  [ROUTES.modules]: 'Wybór modułu',
  [ROUTES.parentHome]: 'Panel rodzica',
  [ROUTES.specialistHome]: 'Panel specjalisty',
  [ROUTES.specialistPatientReports]: 'Raporty pacjenta',
  [ROUTES.specialistPatientReport]: 'Raport tygodniowy pacjenta',
  [ROUTES.specialistParentAccounts]: 'Konta opiekunów',
  [ROUTES.specialistTechniques]: 'Moje techniki',
  [ROUTES.specialistTechniqueNew]: 'Nowa technika',
  [ROUTES.specialistTechniqueEdit]: 'Edycja techniki',
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
