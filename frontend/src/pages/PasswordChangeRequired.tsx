import { fetchCurrentUser } from '../api/auth'
import { useAuth } from '../auth/authContext'
import { useSignOut } from '../hooks/useSignOut'
import ProfilePasswordForm from '../components/ProfilePasswordForm'
import '../components/auth.css'
import './passwordChange.css'

/**
 * "Ustaw własne hasło" — the whole of the app for an account that is still using
 * a password somebody else generated for it.
 *
 * WHO LANDS HERE. Exactly one kind of account: a specialist's, created by another
 * specialist (`core/colleagues.py`). This deployment sends no mail at all, so the
 * first password is generated, comes back once on the creating screen and is
 * handed over in the room — which makes two things true of it that are true of no
 * other credential in the app. Its holder did not choose it, and at least one
 * other person knows it. What the panel behind this screen opens onto is other
 * people's clinical records, so "signed in" has to mean more than "was told a
 * password once".
 *
 * THE GATE IS NOT THIS SCREEN. `App.tsx` sends every other route here, and
 * `core/permissions.HasOwnPassword` refuses every endpoint but the way out on the
 * server. A route guard alone would be a suggestion.
 *
 * IT COMES AFTER THE CONSENTS, and that order is not a preference: `POST
 * /api/account/password/` is itself behind `HasActiveConsents`, so an account sent
 * here first would find the one form it may use refusing it. The consent screen
 * runs first everywhere — see `RequireAuth` and its siblings in App.tsx.
 *
 * WHAT IT DOES NOT DO. It does not accuse anybody of anything and it does not
 * imply the account is compromised. The password was handed over correctly; this
 * is the last step of handing it over. And "Wyloguj się" sits below the form at a
 * readable weight, because an account that cannot finish this right now — the
 * note is at home, the specialist is with a patient — must be able to leave
 * rather than be held on a form it cannot fill in.
 */

function PasswordChangeRequired() {
  const { setUser } = useAuth()
  const signOutAndLeave = useSignOut()

  /**
   * Re-read the account after the password is written, and hand it to the
   * session.
   *
   * `POST /api/account/password/` answers 204 with no body — deliberately, since
   * echoing anything about a password is one more place it lives — so unlike the
   * consent screen there is no updated user to take from the response. Asking
   * /api/auth/me/ is what turns `mustChangePassword` off in the browser, and that
   * is what moves the app: the route guard, not this component, decides where it
   * goes next.
   */
  async function refreshSession() {
    const current = await fetchCurrentUser()
    if (current) setUser(current)
  }

  return (
    <div className="password-gate-page">
      <section className="password-gate-card" aria-labelledby="password-gate-heading">
        <h1 id="password-gate-heading">Ustaw własne hasło</h1>
        <p className="password-gate-lead">
          To konto założył dla Ciebie inny specjalista, a hasło, którym się właśnie
          zalogowałaś lub zalogowałeś, zostało wygenerowane i przekazane Ci osobiście.
          Zna je więc jeszcze co najmniej jedna osoba.
        </p>
        <p className="password-gate-lead">
          Zanim otworzymy panel, ustaw hasło, które znasz tylko Ty. Panel daje dostęp do
          raportów pacjentów, więc dopóki hasło pochodzi od kogoś innego, samo zalogowanie
          nie wystarczy.
        </p>

        <ProfilePasswordForm
          onChanged={refreshSession}
          currentPasswordLabel="Hasło otrzymane przy zakładaniu konta"
          submitLabel="Ustaw hasło i przejdź do panelu"
        />

        <div className="password-gate-actions">
          <button
            type="button"
            className="auth-submit auth-submit-secondary"
            onClick={() => void signOutAndLeave()}
          >
            Wyloguj się
          </button>
        </div>

        <p className="password-gate-note">
          Nie mamy jak wysłać Ci nowego hasła — ta wersja aplikacji nie wysyła żadnej
          poczty. Jeśli zgubisz hasło przekazane przy zakładaniu konta, poproś specjalistę,
          który je zakładał, o utworzenie konta na nowo.
        </p>
      </section>
    </div>
  )
}

export default PasswordChangeRequired
