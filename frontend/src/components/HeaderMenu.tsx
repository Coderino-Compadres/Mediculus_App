import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { useSignOut } from '../hooks/useSignOut'
import { ROUTES, routeTitle } from '../routes'
import { isGuardian, isSpecialist } from '../api/auth'
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
 * The same patient, inside the diet module.
 *
 * WHY A SECOND PATIENT LIST. Every entry in `PATIENT_ITEMS` belongs to the
 * psychotherapy module — the emotion diary, its reports, its analysis, the DBT
 * catalogue — and a patient who has crossed into "Dietetyka i psychodietetyka"
 * was being offered all of it under a header that says DIETETYKA. The menu is
 * the one place on that screen that says what the module contains, so it has to
 * be the module's own.
 *
 * PICKED BY ROUTE, NOT BY ROLE, which is the shape change here: `menuItems` used
 * to ask only what kind of account this is, and both modules belong to the same
 * account. Role still wins first — a guardian or a specialist never sees a
 * patient list, whichever URL they arrived at.
 *
 * THIS LIST IS PROVISIONAL AND DELIBERATELY SHORT. §03 of the client's mockups
 * ("Menu i przełączanie modułów") is the artboard that settles what the diet
 * menu holds, and it is in the part of the document the Claude Design viewer
 * would not scroll to — so nothing is invented here. What is listed is what
 * exists: the module's home, the profile (one account, one profile), and the way
 * back to the other module, mirroring the entry `PATIENT_ITEMS` already carries
 * in the opposite direction. The screens the mockups name — dodawanie posiłku,
 * historia dzienniczków żywieniowych, nawodnienie i suplementy, aktywność
 * fizyczna i sen, raporty, analiza, techniki psychodietetyczne, profil zdrowotny,
 * materiały edukacyjne — join this list as they are built, in the order §03
 * gives them. One open question for that artboard: whether "przełączanie
 * modułów" means a direct jump to the other module (as below) or a link to the
 * chooser on /modules.
 */
const DIET_ITEMS: MenuItem[] = [
  { label: 'Strona główna', to: ROUTES.diet },
  { label: routeTitle(ROUTES.dietJournals), to: ROUTES.dietJournals },
  // §03's order, minus what does not exist: "Nawodnienie i suplementy" (§08)
  // sits between these two in the mockup and is not built yet.
  { label: routeTitle(ROUTES.dietActivitySleep), to: ROUTES.dietActivitySleep },
  { label: routeTitle(ROUTES.profile), to: ROUTES.profile },
  { label: 'Przejdź do części psychoterapeutycznej', to: ROUTES.home },
]

/** Whether this address is inside the diet module — `/diet` and everything under it. */
function isDietRoute(pathname: string): boolean {
  return pathname === ROUTES.diet || pathname.startsWith(`${ROUTES.diet}/`)
}

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
 * A specialist's menu.
 *
 * Same reasoning as the guardian's, with one addition: the catalogue is here,
 * because a specialist writes into it and seeing what a patient sees is the
 * point. Everything else patient-facing is left out — no diary, no reports of
 * their own, no analysis, no safety plan; they have no `patient` row, so all of
 * those answer 403 and App.tsx redirects them away regardless.
 */
const SPECIALIST_ITEMS: MenuItem[] = [
  { label: 'Strona główna', to: ROUTES.specialistHome },
  { label: routeTitle(ROUTES.specialistParentAccounts), to: ROUTES.specialistParentAccounts },
  { label: routeTitle(ROUTES.specialistColleagues), to: ROUTES.specialistColleagues },
  { label: routeTitle(ROUTES.specialistTechniques), to: ROUTES.specialistTechniques },
  { label: routeTitle(ROUTES.techniques), to: ROUTES.techniques },
  { label: routeTitle(ROUTES.profile), to: ROUTES.profile },
]

/**
 * What this account may navigate to.
 *
 * Matches App.tsx's redirects — the two have to agree, or the menu offers a link
 * the router immediately undoes. Asked in the same order as `homeRouteFor`
 * there, so an account that somehow answered to both questions would at least
 * get one consistent answer.
 */
function menuItems(user: AuthUser | null, pathname: string): MenuItem[] {
  const patientItems = isDietRoute(pathname) ? DIET_ITEMS : PATIENT_ITEMS
  if (!user) return patientItems
  if (isSpecialist(user)) return SPECIALIST_ITEMS
  return isGuardian(user) ? GUARDIAN_ITEMS : patientItems
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
            {menuItems(user, pathname).map((item) => (
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
