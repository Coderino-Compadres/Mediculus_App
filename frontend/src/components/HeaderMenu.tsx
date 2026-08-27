import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { PLACEHOLDER_ROUTES, ROUTES } from '../routes'

/** Reuses the placeholder page's own title as the menu label, so a rename only touches routes.ts. */
function placeholderLabel(path: string): string {
  return PLACEHOLDER_ROUTES.find((route) => route.path === path)?.title ?? path
}

const MENU_ITEMS: { label: string; to: string }[] = [
  { label: 'Dzienniczki', to: ROUTES.journals },
  { label: 'Raporty', to: ROUTES.reports },
  { label: placeholderLabel(ROUTES.analysis), to: ROUTES.analysis },
  { label: placeholderLabel(ROUTES.techniques), to: ROUTES.techniques },
  { label: placeholderLabel(ROUTES.profile), to: ROUTES.profile },
  // TODO: not in the mockup, but confirmed as a high-priority feature (US-PT-13)
  // — added as a plain menu entry for now, no escalation logic yet.
  { label: placeholderLabel(ROUTES.safetyPlan), to: ROUTES.safetyPlan },
  { label: 'Przejdź do części dietetyczno-psychodietetycznej', to: ROUTES.diet },
]

/** Header dropdown menu, shared by every screen with a home-style header (Home, DiaryEntry, …). */
function HeaderMenu() {
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    setOpen(false)
    try {
      await signOut()
    } catch {
      // Local session is cleared either way (see AuthProvider.signOut); a failed
      // logout request still has to land the user back on /login.
    } finally {
      navigate(ROUTES.login, { replace: true })
    }
  }

  return (
    <div className="home-menu">
      <button
        type="button"
        className="home-menu-toggle"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <>
          <div className="home-menu-backdrop" onClick={() => setOpen(false)} />
          <nav className="home-menu-dropdown">
            {user?.email && (
              <div className="home-menu-account">
                <p className="home-menu-account-email">{user.email}</p>
                {user.role && <p className="home-menu-account-role">{user.role}</p>}
              </div>
            )}
            {MENU_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <button type="button" className="home-menu-signout" onClick={() => void onSignOut()}>
              Wyloguj
            </button>
          </nav>
        </>
      )}
    </div>
  )
}

export default HeaderMenu
