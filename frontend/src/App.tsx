import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ModuleSelect from './pages/ModuleSelect'
import LinkGuardian from './pages/LinkGuardian'
import ConsentsRequired from './pages/ConsentsRequired'
import ParentHome from './pages/ParentHome'
import SpecialistHome from './pages/SpecialistHome'
import SpecialistPatientReports from './pages/SpecialistPatientReports'
import SpecialistPatientReport from './pages/SpecialistPatientReport'
import SpecialistParentAccounts from './pages/SpecialistParentAccounts'
import SpecialistTechniques from './pages/SpecialistTechniques'
import SpecialistTechniqueForm from './pages/SpecialistTechniqueForm'
import Home from './pages/Home'
import DiaryEntry from './pages/DiaryEntry'
import Journals from './pages/Journals'
import JournalDetail from './pages/JournalDetail'
import Reports from './pages/Reports'
import ReportDetail from './pages/ReportDetail'
import Analysis from './pages/Analysis'
import Techniques from './pages/Techniques'
import TechniqueDetail from './pages/TechniqueDetail'
import Profile from './pages/Profile'
import SafetyPlan from './pages/SafetyPlan'
import PlaceholderPage from './pages/PlaceholderPage'
import NotFound from './pages/NotFound'
import OfflineBanner from './components/OfflineBanner'
import RouteChange from './components/RouteChange'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/authContext'
import { isGuardian, isSpecialist, needsConsents, needsGuardianLink } from './api/auth'
import { PLACEHOLDER_ROUTES, ROUTES } from './routes'
import type { AuthUser } from './api/auth'

/**
 * Where an account belongs when it arrives with no particular screen in mind —
 * after logging in, and on '/'.
 *
 * Neither a guardian nor a specialist belongs on the patient's module chooser:
 * both tiles on it lead into the patient app, which answers them 403. One
 * function, because four places make that redirect and a fifth would eventually
 * disagree.
 *
 * The two are asked in a fixed order, and the order is arbitrary only because
 * the two are exclusive in practice — an account has a `specjalist` row or a
 * `patient` row or neither, and a guardian is recognised by their role. If a
 * single account ever needs to be both, this is the line that has to decide.
 */
function homeRouteFor(user: AuthUser): string {
  if (isSpecialist(user)) return ROUTES.specialistHome
  return isGuardian(user) ? ROUTES.parentHome : ROUTES.modules
}

/** Both guards have to wait for the first /api/auth/me/, or a reload would
 *  bounce a logged-in user to /login before the answer arrives. */
function AuthPending() {
  return <div className="auth-page" aria-busy="true" />
}

/**
 * A screen of the patient app.
 *
 * `allowGuardian` **defaults to false**, mirroring `require_guardian_link` on
 * `_require_patient` and for the same reason: a screen added later that never
 * thinks about the question is closed rather than accidentally showing a
 * guardian a refusal it can only word as "coś poszło nie tak". Everything
 * behind that helper answers a guardian 403, so sending them to their own
 * screen is the honest answer rather than a courtesy.
 *
 * Exactly one caller opts out, and `/profile` is a real exception rather than an
 * oversight: identity, the consent register (RODO art. 7(3) — withdrawing has to
 * be as easy as consenting) and the password form all work for a guardian, and
 * `GET /api/account/profile/` is the only thing on that screen that does not —
 * which is why the screen asks for it only when `hasPatientProfile`.
 */
function RequireAuth({
  children,
  allowGuardian = false,
  allowSpecialist = false,
}: {
  children: ReactNode
  allowGuardian?: boolean
  allowSpecialist?: boolean
}) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  // Checked before everything else, because it is the outer question: without
  // the consents there is no lawful basis to process anything, whoever has or
  // has not vouched for the account — and unlike the guardian gate, this is one
  // the account's own owner can clear by themselves.
  if (needsConsents(user)) return <Navigate to={ROUTES.consents} replace />
  // A minor's account is unusable until a guardian's account vouches for it, so
  // every other screen leads back to the one form that can fix that.
  if (needsGuardianLink(user)) return <Navigate to={ROUTES.linkGuardian} replace />
  // Note the order: `allowGuardian` exempts /profile from the *guardian*
  // redirect only. There is no exemption from the consent gate — the profile is
  // where a consent is withdrawn, and staying on it afterwards would leave the
  // account looking at its own data with no basis to be shown it.
  if (!allowGuardian && isGuardian(user)) {
    return <Navigate to={ROUTES.parentHome} replace />
  }
  // Same shape and same default as `allowGuardian`, for the same reason: a
  // specialist has no `patient` row either, so every clinical screen answers
  // them 403 and a patient screen added later sends them to their own panel
  // rather than to a refusal it can only word as "coś poszło nie tak".
  if (!allowSpecialist && isSpecialist(user)) {
    return <Navigate to={ROUTES.specialistHome} replace />
  }
  return <>{children}</>
}

/** The mirror image of RequireAuth's redirect: only a guardian belongs here. */
function RequireGuardian({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  if (needsConsents(user)) return <Navigate to={ROUTES.consents} replace />
  return isGuardian(user) ? <>{children}</> : <Navigate to={homeRouteFor(user)} replace />
}

/**
 * The same, for the specialist panel.
 *
 * The consent gate is checked here too, and it is not decoration: the panel is
 * behind `HasActiveConsents` on the backend like everything else, so a
 * specialist whose own consents are withdrawn would otherwise reach a screen
 * that 403s on every request it makes.
 */
function RequireSpecialist({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  if (needsConsents(user)) return <Navigate to={ROUTES.consents} replace />
  return isSpecialist(user) ? <>{children}</> : <Navigate to={homeRouteFor(user)} replace />
}

/**
 * The consent screen, and only for an account that needs it.
 *
 * The mirror of the redirect above, for the same reason `RequireGuardianLink`
 * exists: a screen that says "your account is stopped" must not be reachable by
 * an account that is running.
 */
function RequireConsents({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  return needsConsents(user) ? <>{children}</> : <Navigate to={homeRouteFor(user)} replace />
}

/** The same, for the one screen only an unlinked minor belongs on. */
function RequireGuardianLink({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  if (needsConsents(user)) return <Navigate to={ROUTES.consents} replace />
  return needsGuardianLink(user) ? <>{children}</> : <Navigate to={homeRouteFor(user)} replace />
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (user && needsConsents(user)) return <Navigate to={ROUTES.consents} replace />
  return user ? <Navigate to={homeRouteFor(user)} replace /> : <>{children}</>
}

/** '/' is not a screen; it is whichever landing screen this account has. */
function LandingRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  if (needsConsents(user)) return <Navigate to={ROUTES.consents} replace />
  return <Navigate to={homeRouteFor(user)} replace />
}

function App() {
  return (
    <AuthProvider>
      <RouteChange />
      <OfflineBanner />
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      {/* tabIndex so the skip link can land on it; #main also keeps the flex
          chain that lets a page fill the viewport (see index.css). */}
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route
            path={ROUTES.login}
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />
          <Route
            path={ROUTES.register}
            element={
              <GuestOnly>
                <Register />
              </GuestOnly>
            }
          />
          <Route
            path={ROUTES.consents}
            element={
              <RequireConsents>
                <ConsentsRequired />
              </RequireConsents>
            }
          />
          <Route
            path={ROUTES.linkGuardian}
            element={
              <RequireGuardianLink>
                <LinkGuardian />
              </RequireGuardianLink>
            }
          />
          <Route
            path={ROUTES.parentHome}
            element={
              <RequireGuardian>
                <ParentHome />
              </RequireGuardian>
            }
          />
          <Route
            path={ROUTES.specialistHome}
            element={
              <RequireSpecialist>
                <SpecialistHome />
              </RequireSpecialist>
            }
          />
          <Route
            path={ROUTES.specialistPatientReports}
            element={
              <RequireSpecialist>
                <SpecialistPatientReports />
              </RequireSpecialist>
            }
          />
          <Route
            path={ROUTES.specialistPatientReport}
            element={
              <RequireSpecialist>
                <SpecialistPatientReport />
              </RequireSpecialist>
            }
          />
          <Route
            path={ROUTES.specialistParentAccounts}
            element={
              <RequireSpecialist>
                <SpecialistParentAccounts />
              </RequireSpecialist>
            }
          />
          <Route
            path={ROUTES.specialistTechniques}
            element={
              <RequireSpecialist>
                <SpecialistTechniques />
              </RequireSpecialist>
            }
          />
          <Route
            path={ROUTES.specialistTechniqueNew}
            element={
              <RequireSpecialist>
                <SpecialistTechniqueForm />
              </RequireSpecialist>
            }
          />
          <Route
            path={ROUTES.specialistTechniqueEdit}
            element={
              <RequireSpecialist>
                <SpecialistTechniqueForm />
              </RequireSpecialist>
            }
          />
          <Route
            path={ROUTES.modules}
            element={
              <RequireAuth>
                <ModuleSelect />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.home}
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.diaryEntry}
            element={
              <RequireAuth>
                <DiaryEntry />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.journals}
            element={
              <RequireAuth>
                <Journals />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.journalDetail}
            element={
              <RequireAuth>
                <JournalDetail />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.reports}
            element={
              <RequireAuth>
                <Reports />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.reportDetail}
            element={
              <RequireAuth>
                <ReportDetail />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.analysis}
            element={
              <RequireAuth>
                <Analysis />
              </RequireAuth>
            }
          />
          {/* The catalogue is the one patient screen a specialist belongs on:
              they write into it, and /api/techniques/ refuses nobody who is
              signed in (it is a catalogue, not a record about a person). Seeing
              what a patient sees is the point — a preview that differed from the
              real screen would be worth less than none. */}
          <Route
            path={ROUTES.techniques}
            element={
              <RequireAuth allowSpecialist>
                <Techniques />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.techniqueDetail}
            element={
              <RequireAuth allowSpecialist>
                <TechniqueDetail />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.profile}
            element={
              /* The one opt-out — see RequireAuth. A guardian's and a
                 specialist's profile is genuinely theirs; only its clinical half
                 (the counters and the care card) is left out, and the screen
                 itself asks for that only when `hasPatientProfile`. */
              <RequireAuth allowGuardian allowSpecialist>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.safetyPlan}
            element={
              <RequireAuth>
                <SafetyPlan />
              </RequireAuth>
            }
          />
          {PLACEHOLDER_ROUTES.map(({ path, title, backTo, backLabel }) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireAuth>
                  <PlaceholderPage title={title} backTo={backTo} backLabel={backLabel} />
                </RequireAuth>
              }
            />
          ))}
            <Route path="/" element={<LandingRedirect />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </AuthProvider>
  )
}

export default App
