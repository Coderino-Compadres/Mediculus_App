import { useEffect, useState } from 'react'
import AccountClosureConfirm from '../components/AccountClosureConfirm'
import CollapsibleCard from '../components/CollapsibleCard'
import HeaderMenu from '../components/HeaderMenu'
import ProfileAvatar from '../components/ProfileAvatar'
import ProfileDataRights from '../components/ProfileDataRights'
import ProfileEmailForm from '../components/ProfileEmailForm'
import ProfilePasswordForm from '../components/ProfilePasswordForm'
import ServicesConsentWithdrawal from '../components/ServicesConsentWithdrawal'
import { useAuth } from '../auth/authContext'
import { useSignOut } from '../hooks/useSignOut'
import { PROFILE_ACTIVITY, PROFILE_CARE } from '../data/profile'
import { fullName } from '../utils/profile'
import { roleLabel } from '../utils/roles'
import type { AccountClosureReason } from '../types/profile'
// The page frame, the confirmation frame and the collapsible sections. auth.css
// is in the list because the four forms on this screen use .auth-form /
// .auth-submit / .auth-success: until now it arrived only because AuthLayout
// imports it and App.tsx pulls Login in eagerly, so route-level lazy loading
// would have left the profile forms unstyled.
import '../components/auth.css'
import './journals.css'
import './journalDetail.css'
import './diaryEntry.css'
import './profile.css'

/**
 * "Profil" — who the account belongs to, how much has been written, who is
 * treating the patient, and what can be done about the data.
 *
 * Two sources feed this screen and the difference matters. Identity — name,
 * e-mail, account type — is real: it is collected at registration and read from
 * `useAuth()`, so the profile always belongs to whoever is signed in. Everything
 * else (the counters, the care details, the consent dates) has no endpoint yet
 * and comes from `src/data/profile.ts`, so that switching to an API is a change
 * of import rather than a rewrite. Nothing on this screen writes anything.
 *
 * TODO(warianty kont): this is the adult patient's profile, and only that. The
 * app has four account types (ACCOUNT_TYPE_OPTIONS in pages/Register.tsx, and the
 * specialist besides), and two of them need a screen designed rather than
 * adapted:
 *   - a guardian's profile is mostly the link to the child's account — an
 *     invitation to answer, a child to look after — and has no diary, no
 *     counters and no care card of its own, since a guardian is not a clinical
 *     subject (they get no `patient` row at all, see core/serializers.py). It is
 *     also usually created by the specialist at the first appointment, which
 *     makes its self-service surface different again;
 *   - a minor's profile has to show where the guardian's consent stands, since
 *     that is what gates their whole account (RODO art. 8) — and the data-rights
 *     section below is a genuine design question there: a minor cannot give the
 *     art. 9 consent for themselves, so it is not obvious they can withdraw it
 *     alone either.
 * Neither is a variation on this file; both are their own task.
 */

/**
 * Which of the profile's screens is on show.
 *
 * Local state rather than routes: the three confirmations are steps inside one
 * decision, and giving them addresses would put "you are about to delete your
 * account" in the history, one back-button press away from a user who already
 * said no — and one shared link away from somebody else's phone. They are
 * unreachable except from this screen, which is the intent.
 */
type ProfileView =
  | { kind: 'profile' }
  | { kind: 'closure'; reason: AccountClosureReason }
  | { kind: 'services-consent' }

function CareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-care-row">
      <span className="profile-care-label">{label}</span>
      <span className="profile-care-value">{value}</span>
    </div>
  )
}

function Profile() {
  const { user } = useAuth()
  const signOutAndLeave = useSignOut()
  const [view, setView] = useState<ProfileView>({ kind: 'profile' })

  // RouteChange scrolls to the top when the *path* changes, and these views
  // share one path — so without this, opening a confirmation from the bottom of a
  // long profile would show its middle.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  // RequireAuth guarantees a user by the time this renders; the guard is for the
  // type, and returning nothing beats rendering a profile with blanks in it.
  if (!user) return null

  const backToProfile = () => setView({ kind: 'profile' })

  if (view.kind === 'closure') {
    return <AccountClosureConfirm reason={view.reason} onBack={backToProfile} />
  }
  if (view.kind === 'services-consent') {
    return <ServicesConsentWithdrawal onBack={backToProfile} />
  }

  const name = fullName(user.firstName, user.lastName)

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PSYCHOTERAPIA</p>
          <h1>Profil</h1>
        </div>
        <HeaderMenu />
      </header>

      <section className="profile-card profile-identity">
        <ProfileAvatar firstName={user.firstName} lastName={user.lastName} email={user.email} />
        <div className="profile-identity-text">
          {/* The e-mail carries the heading when the account has no name, rather
              than an empty line where a name should be. */}
          <h2>{name ?? user.email}</h2>
          {name && user.email && <p className="profile-identity-email">{user.email}</p>}
          {user.role && <p className="profile-identity-role">{roleLabel(user.role)}</p>}
        </div>
      </section>

      {/* Two counters, not the mockup's three — the missing one is "techniki".
          Counting techniques used needs a durable record of the
          "pomogło / trochę / nie tym razem" rating, and that record was
          deliberately never built: the shape of the rating is still open with the
          client (`raport.technique_efficiency` is the column waiting for it, and
          nothing writes it). The tile would therefore have to show a number that
          cannot be computed from anything, which on a health app reads as data
          rather than as a gap. See src/data/profile.ts. */}
      <section className="profile-counters" aria-label="Twoja aktywność">
        <div className="profile-counter">
          <span className="profile-counter-value">{PROFILE_ACTIVITY.entryCount}</span>
          <span className="profile-counter-label">wpisów</span>
        </div>
        <div className="profile-counter">
          <span className="profile-counter-value">{PROFILE_ACTIVITY.streakDays}</span>
          <span className="profile-counter-label">dni z rzędu</span>
        </div>
      </section>

      <section className="profile-card" aria-labelledby="profile-care">
        <h2 id="profile-care" className="profile-section-label">
          OPIEKA
        </h2>
        {/* One row. "Nurt" and the two appointment rows were removed on
            request — the appointment calendar is low priority anyway ("zrobimy,
            jeśli starczy czasu"), so nothing here was waiting on it. The row
            that stays is the one with a home in the schema: `patient.specjalist`
            in user_db, a serializer away from being real. */}
        <div className="profile-care-list">
          <CareRow label="Terapeuta" value={PROFILE_CARE.specialist} />
        </div>

        {/*
          Deliberately NOT here: any way for the patient to disconnect the
          specialist or revoke their access to the data.

          The discovery document says the patient may withdraw that consent at any
          time. The client overruled it at a later meeting, with a clinical reason:
          with eating disorders the tendency to hide information rises as things
          get worse, so a patient-side switch would disable the feature exactly in
          the cases it exists for. Disconnecting happens on the SPECIALIST's side.
          The newer decision wins.

          This note is here so nobody "fixes" it back on the strength of the older
          document. The same conflict and the same resolution are recorded on the
          reports screen, which is why it has no "share with therapist" step
          either — see the TODO in pages/Reports.tsx.
        */}
      </section>

      <ProfileDataRights
        onOpenClosure={(reason) => setView({ kind: 'closure', reason })}
        onOpenServicesWithdrawal={() => setView({ kind: 'services-consent' })}
      />

      <CollapsibleCard title="Zmień adres e-mail">
        <ProfileEmailForm currentEmail={user.email} />
      </CollapsibleCard>

      <CollapsibleCard title="Zmień hasło">
        <ProfilePasswordForm />
      </CollapsibleCard>

      {/* The same sign-out the header menu uses — one implementation, in
          hooks/useSignOut.ts. */}
      <button
        type="button"
        className="profile-secondary-button profile-signout"
        onClick={() => void signOutAndLeave()}
      >
        Wyloguj
      </button>
    </div>
  )
}

export default Profile
