/** Every route path in one place, so a rename touches a single line instead of every menu/nav that links to it. */
export const ROUTES = {
  login: '/login',
  register: '/register',
  modules: '/modules',
  linkGuardian: '/link-guardian',
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
  safetyPlan: '/safety-plan-placeholder',
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
  { path: ROUTES.safetyPlan, title: 'Plan bezpieczeństwa' },
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
  [ROUTES.modules]: 'Wybór modułu',
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
