/** Every route path in one place, so a rename touches a single line instead of every menu/nav that links to it. */
export const ROUTES = {
  login: '/login',
  register: '/register',
  modules: '/modules',
  linkGuardian: '/link-guardian',
  home: '/home',
  journals: '/journals',
  journalDetail: '/journals/:id',
  diaryEntry: '/diary-entry-placeholder',
  reports: '/reports-placeholder',
  analysis: '/analysis-placeholder',
  techniques: '/techniques-placeholder',
  profile: '/profile-placeholder',
  safetyPlan: '/safety-plan-placeholder',
  diet: '/diet-placeholder',
} as const

/** Fills in ROUTES.journalDetail's `:id` param — use instead of building the path by hand. */
export function journalDetailPath(id: string): string {
  return ROUTES.journalDetail.replace(':id', id)
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
  { path: ROUTES.reports, title: 'Raporty' },
  { path: ROUTES.analysis, title: 'Analiza' },
  { path: ROUTES.techniques, title: 'Techniki terapeutyczne' },
  { path: ROUTES.profile, title: 'Profil' },
  { path: ROUTES.safetyPlan, title: 'Plan bezpieczeństwa' },
]
