import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ModuleSelect from './pages/ModuleSelect'
import LinkGuardian from './pages/LinkGuardian'
import ParentHome from './pages/ParentHome'
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
import { isGuardian, needsGuardianLink } from './api/auth'
import { PLACEHOLDER_ROUTES, ROUTES } from './routes'
import type { AuthUser } from './api/auth'

/**
 * Where an account belongs when it arrives with no particular screen in mind —
 * after logging in, and on '/'.
 *
 * A guardian's landing screen is not the patient's module chooser: both tiles on
 * it lead into the patient app, which answers them 403. One function, because
 * three places make that redirect and a fourth would eventually disagree.
 */
function homeRouteFor(user: AuthUser): string {
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
}: {
  children: ReactNode
  allowGuardian?: boolean
}) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  // A minor's account is unusable until a guardian's account vouches for it, so
  // every other screen leads back to the one form that can fix that.
  if (needsGuardianLink(user)) return <Navigate to={ROUTES.linkGuardian} replace />
  if (!allowGuardian && isGuardian(user)) {
    return <Navigate to={ROUTES.parentHome} replace />
  }
  return <>{children}</>
}

/** The mirror image of RequireAuth's redirect: only a guardian belongs here. */
function RequireGuardian({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  return isGuardian(user) ? <>{children}</> : <Navigate to={homeRouteFor(user)} replace />
}

/** The same, for the one screen only an unlinked minor belongs on. */
function RequireGuardianLink({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  return needsGuardianLink(user) ? <>{children}</> : <Navigate to={homeRouteFor(user)} replace />
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  return user ? <Navigate to={homeRouteFor(user)} replace /> : <>{children}</>
}

/** '/' is not a screen; it is whichever landing screen this account has. */
function LandingRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
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
          <Route
            path={ROUTES.techniques}
            element={
              <RequireAuth>
                <Techniques />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.techniqueDetail}
            element={
              <RequireAuth>
                <TechniqueDetail />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.profile}
            element={
              /* The one opt-out — see RequireAuth. A guardian's profile is
                 genuinely theirs; only its clinical half is left out. */
              <RequireAuth allowGuardian>
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
