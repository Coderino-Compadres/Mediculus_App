import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ModuleSelect from './pages/ModuleSelect'
import LinkGuardian from './pages/LinkGuardian'
import Home from './pages/Home'
import DiaryEntry from './pages/DiaryEntry'
import Journals from './pages/Journals'
import JournalDetail from './pages/JournalDetail'
import Reports from './pages/Reports'
import ReportDetail from './pages/ReportDetail'
import Analysis from './pages/Analysis'
import Profile from './pages/Profile'
import PlaceholderPage from './pages/PlaceholderPage'
import NotFound from './pages/NotFound'
import OfflineBanner from './components/OfflineBanner'
import RouteChange from './components/RouteChange'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/authContext'
import { needsGuardianLink } from './api/auth'
import { PLACEHOLDER_ROUTES, ROUTES } from './routes'

/** Both guards have to wait for the first /api/auth/me/, or a reload would
 *  bounce a logged-in user to /login before the answer arrives. */
function AuthPending() {
  return <div className="auth-page" aria-busy="true" />
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  // A minor's account is unusable until a guardian's account vouches for it, so
  // every other screen leads back to the one form that can fix that.
  if (needsGuardianLink(user)) return <Navigate to={ROUTES.linkGuardian} replace />
  return <>{children}</>
}

/** The mirror image of RequireAuth's redirect: only an unlinked minor belongs here. */
function RequireGuardianLink({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  if (!user) return <Navigate to={ROUTES.login} replace />
  return needsGuardianLink(user) ? <>{children}</> : <Navigate to={ROUTES.modules} replace />
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  return user ? <Navigate to={ROUTES.modules} replace /> : <>{children}</>
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
            path={ROUTES.profile}
            element={
              <RequireAuth>
                <Profile />
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
            <Route path="/" element={<Navigate to={ROUTES.modules} replace />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </AuthProvider>
  )
}

export default App
