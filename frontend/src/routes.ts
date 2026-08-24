/** Every route path in one place, so a rename touches a single line instead of every menu/nav that links to it. */
export const ROUTES = {
  login: '/login',
  register: '/register',
  modules: '/modules',
  home: '/home',
  journals: '/journals-placeholder',
  diaryEntry: '/diary-entry-placeholder',
  reports: '/reports-placeholder',
  analysis: '/analysis-placeholder',
  techniques: '/techniques-placeholder',
  profile: '/profile-placeholder',
  safetyPlan: '/safety-plan-placeholder',
  diet: '/diet-placeholder',
} as const

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
  { path: ROUTES.journals, title: 'Dzienniczki' },
  { path: ROUTES.reports, title: 'Raporty' },
  { path: ROUTES.analysis, title: 'Analiza' },
  { path: ROUTES.techniques, title: 'Techniki terapeutyczne' },
  { path: ROUTES.profile, title: 'Profil' },
  { path: ROUTES.safetyPlan, title: 'Plan bezpieczeństwa' },
]
