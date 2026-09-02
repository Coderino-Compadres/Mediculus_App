import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { useSignOut } from '../hooks/useSignOut'
import { ROUTES, routeTitle } from '../routes'
import { isGuardian } from '../api/auth'
import { roleLabel } from '../utils/roles'
import type { AuthUser } from '../api/auth'

interface MenuItem {
  label: string
  to: string
}

const PATIENT_ITEMS: MenuItem[] = [
  // First, because every other entry leads away from it and several screens
  // have no back arrow of their own — without it the menu is a one-way trip.
  { label: 'Strona główna', to: ROUTES.home },
  { label: 'Dzienniczki', to: ROUTES.journals },
  { label: 'Raporty', to: ROUTES.reports },
  { label: routeTitle(ROUTES.analysis), to: ROUTES.analysis },
  { label: routeTitle(ROUTES.techniques), to: ROUTES.techniques },
  { label: routeTitle(ROUTES.profile), to: ROUTES.profile },
  // TODO: not in the mockup, but confirmed as a high-priority feature (US-PT-13)
  // — added as a plain menu entry for now, no escalation logic yet.
  { label: routeTitle(ROUTES.safetyPlan), to: ROUTES.safetyPlan },
  { label: 'Przejdź do części dietetycznej i psychodietetycznej', to: ROUTES.diet },
]

/**
 * A guardian's menu, which is short because their view is one screen.
 *
 * Every patient entry is left out rather than disabled: a guardian has no
 * `patient` row, so the diary, the reports, the analysis and the safety plan all
 * answer them 403, and App.tsx redirects them away from those routes anyway.
 * A menu that lists screens you are bounced off is worse than a short one.
 * "Profil" stays because it is genuinely theirs — identity, the consent register
 * and the password form all work for a guardian account.
 */
const GUARDIAN_ITEMS: MenuItem[] = [
  { label: 'Strona główna', to: ROUTES.parentHome },
  { label: routeTitle(ROUTES.profile), to: ROUTES.profile },
]

/**
 * What this account may navigate to.
 *
 * Keyed on the role, matching App.tsx's redirects — the two have to agree, or
 * the menu offers a link the router immediately undoes.
 */
function menuItems(user: AuthUser | null): MenuItem[] {
  return user && isGuardian(user) ? GUARDIAN_ITEMS : PATIENT_ITEMS
}

/** Header dropdown menu, shared by every screen with a home-style header (Home, DiaryEntry, …). */
function HeaderMenu() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const signOutAndLeave = useSignOut()
  const { pathname } = useLocation()
  const toggle = useRef<HTMLButtonElement>(null)

  // Escape closes it and the focus goes back where it came from. Without the
  // second half a keyboard user lands at the top of the document and walks the
  // whole header again — the menu opens fine and traps you on the way out.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  async function onSignOut() {
    setOpen(false)
    // Shared with the profile screen's own "Wyloguj" — see hooks/useSignOut.ts.
    await signOutAndLeave()
  }

  return (
    <div className="home-menu">
      <button
        ref={toggle}
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
                {user.role && (
                  <p className="home-menu-account-role">{roleLabel(user.role)}</p>
                )}
              </div>
            )}
            {menuItems(user).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                // Marks the screen you are already on. Nothing else in the menu
                // says where you are.
                aria-current={item.to === pathname ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
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
