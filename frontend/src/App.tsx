import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ModuleSelect from './pages/ModuleSelect'
import Home from './pages/Home'
import DiaryEntry from './pages/DiaryEntry'
import PlaceholderPage from './pages/PlaceholderPage'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/authContext'
import { PLACEHOLDER_ROUTES, ROUTES } from './routes'

/** Both guards have to wait for the first /api/auth/me/, or a reload would
 *  bounce a logged-in user to /login before the answer arrives. */
function AuthPending() {
  return <div className="auth-page" aria-busy="true" />
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  return user ? <>{children}</> : <Navigate to={ROUTES.login} replace />
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthPending />
  return user ? <Navigate to={ROUTES.modules} replace /> : <>{children}</>
}

function App() {
  return (
    <AuthProvider>
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
        <Route path="*" element={<Navigate to={ROUTES.modules} replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
