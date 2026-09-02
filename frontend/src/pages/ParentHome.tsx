import mediculusLogo from '../assets/mediculus-logo.jpeg'
import GuardianInvitations from '../components/GuardianInvitations'
import HeaderMenu from '../components/HeaderMenu'
import { useAuth } from '../auth/authContext'
// moduleSelect.css is the page frame and the greeting block, reused rather than
// redrawn — this screen is the guardian's equivalent of that one. home.css is
// here for the .home-menu-* rules HeaderMenu's markup needs, which otherwise
// arrive only because App.tsx pulls Home in eagerly (the same explicit import
// SafetyPlan.tsx carries, for the same reason).
import './moduleSelect.css'
import './home.css'
import './parentHome.css'

/**
 * "Panel rodzica" — the guardian's whole view of the app, for now.
 *
 * A guardian is not a clinical subject: they get no `patient` row at
 * registration (ACCOUNT_TYPES in core/serializers.py), so they have no diary, no
 * reports and no dashboard, and every endpoint behind `_require_patient`
 * answers them 403. Until this screen existed they were nevertheless dropped on
 * `/modules` and offered the two patient modules — a tile leading to /home,
 * which then failed on a refusal the screen could only word as "coś poszło nie
 * tak". They land here instead.
 *
 * WHAT IS ACTUALLY HERE. Two things, and the split matters:
 *
 *   1. the invitations card, which is real and is the guardian's one live
 *      function. It moved here from /modules along with the guardian, because a
 *      minor's account is blocked until it is answered (RODO art. 8) and the
 *      guardian is now the only person who can answer it. Leaving it on a screen
 *      they can no longer reach would have stranded every child mid-signup —
 *      which is why this screen is not *only* the placeholder below;
 *   2. the placeholder, for everything else the parent panel is meant to be.
 *
 * THE PLACEHOLDER SAYS NOTHING ABOUT WHAT THE PARENT WILL SEE. That is the whole
 * reason it is worded the way it is. What a guardian may read of a minor's
 * record is undecided and is not a UI question: the diary is health data the
 * child writes about themselves, the reports are written for the treating
 * specialist, and the app's one firm rule in this area runs the other way — with
 * eating disorders the tendency to hide information rises, which is why the
 * patient cannot cut the specialist off (see the note in pages/Reports.tsx).
 * Promising "podgląd dzienniczka dziecka" on a placeholder would be answering
 * that in markup, and a client reviewing this screen would reasonably read it as
 * settled.
 */
function ParentHome() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? ''

  return (
    <div className="module-page parent-page">
      {/* Out of the centred header block and pinned to the corner, where every
          other screen in the app keeps it. The menu is role-aware (see
          components/HeaderMenu.tsx): a guardian gets this screen, the profile
          and "Wyloguj", and none of the patient entries that would lead them
          only to a refusal. */}
      <div className="parent-menu">
        <HeaderMenu />
      </div>

      <div className="module-header">
        <img className="module-logo" src={mediculusLogo} alt="Fundacja Mediculus" />
        <p className="module-greeting">{firstName ? `Cześć, ${firstName}` : 'Cześć'}</p>
        <h1>Panel rodzica</h1>
        <p className="module-subtitle">
          Konto opiekuna. Nie prowadzisz tu własnego dzienniczka.
        </p>
      </div>

      {/* Above the placeholder, deliberately. It is the one thing on this screen
          that does something, and somebody is waiting on the other side of it. */}
      <GuardianInvitations />

      <section className="parent-placeholder" aria-labelledby="parent-placeholder-heading">
        <p className="parent-placeholder-badge">W BUDOWIE</p>
        <h2 id="parent-placeholder-heading">Panel rodzica powstaje</h2>
        <p>
          Na razie możesz tu odpowiedzieć na zaproszenie od dziecka i zarządzać swoim kontem.
          Reszta panelu — w tym to, co opiekun widzi z konta dziecka — jest jeszcze ustalana
          z Fundacją.
        </p>
        <p className="parent-placeholder-note">
          Damy znać, kiedy pojawi się tu coś nowego.
        </p>
      </section>
    </div>
  )
}

export default ParentHome
