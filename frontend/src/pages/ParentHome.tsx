import mediculusLogo from '../assets/mediculus-logo.jpeg'
import GuardianChildren from '../components/GuardianChildren'
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
 *   1. the invitations card, which is the guardian's one *action*. It moved here
 *      from /modules along with the guardian, because a minor's account is
 *      blocked until it is answered (RODO art. 8) and the guardian is now the
 *      only person who can answer it. Leaving it on a screen they can no longer
 *      reach would have stranded every child mid-signup;
 *   2. the summary of each linked child's account, which is what a guardian
 *      comes here to read;
 *   3. the placeholder, for whatever the panel grows into next.
 *
 * WHAT THE SUMMARY SHOWS IS A DECIDED LINE, NOT A FIRST PASS. It reports
 * engagement — how much the child has written, whether a run is going, when the
 * last entry was — and nothing of what any of it says. See the header of
 * components/GuardianChildren.tsx for the argument, and CHILD_SUMMARY_FIELDS in
 * core/account.py for the list the backend will send. The placeholder below
 * therefore still promises nothing about content: whether a guardian may ever
 * read a minor's diary is a clinical and legal question, not a UI one, and
 * answering it in markup would let a client read it as settled.
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

      {/* First, deliberately. It is the one thing on this screen that needs an
          answer, and somebody is waiting on the other side of it. */}
      <GuardianInvitations />

      {/* Then what the guardian actually came for, once they have answered. */}
      <GuardianChildren />

      <section className="parent-placeholder" aria-labelledby="parent-placeholder-heading">
        <p className="parent-placeholder-badge">W BUDOWIE</p>
        <h2 id="parent-placeholder-heading">Panel rodzica powstaje</h2>
        <p>
          Możesz tu odpowiedzieć na zaproszenie od dziecka, sprawdzić, czy korzysta z
          aplikacji, i zarządzać swoim kontem. Reszta panelu jest jeszcze ustalana
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
