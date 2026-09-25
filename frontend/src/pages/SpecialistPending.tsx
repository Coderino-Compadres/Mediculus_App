import { useState } from 'react'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import HeaderMenu from '../components/HeaderMenu'
import { useAuth } from '../auth/authContext'
import { fetchCurrentUser } from '../api/auth'
import '../styles/panel.css'
import './home.css'

const CHECK_ERROR = 'Nie udało się sprawdzić stanu konta. Spróbuj ponownie.'

/**
 * "Konto czeka na weryfikację" — a specialist account an administrator has not
 * confirmed yet.
 *
 * The third thing a new specialist account meets, after the consents and its
 * own password: a colleague vouched for the person by creating the account, and
 * the foundation's administrator gives the final word (core/admin_panel.py).
 * Until then `_require_specialist` refuses every panel endpoint, so this screen
 * is the whole of what the account can do — apart from /profile, which is its
 * own identity, consents and password and stays reachable.
 *
 * "Sprawdź ponownie" re-reads /api/auth/me/ rather than asking the person to
 * sign out and back in: approval happens on somebody else's screen and nothing
 * pushes it here. Once `specialist_approved` comes back true, the route guard
 * sends the account to its panel by itself.
 *
 * A rejection needs no screen: it deletes the account and ends its sessions, so
 * the next request is simply signed out.
 */
function SpecialistPending() {
  const { user, setUser } = useAuth()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stillWaiting, setStillWaiting] = useState(false)
  const firstName = user?.firstName ?? ''

  async function check() {
    setChecking(true)
    setError(null)
    setStillWaiting(false)
    try {
      const refreshed = await fetchCurrentUser()
      setUser(refreshed)
      if (refreshed?.specialistApproved === false) setStillWaiting(true)
    } catch {
      setError(CHECK_ERROR)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="panel-page">
      <div className="panel-menu">
        <HeaderMenu />
      </div>

      <div className="panel-header">
        <img className="panel-logo" src={mediculusLogo} alt="Fundacja Mediculus" />
        <p className="panel-greeting">{firstName ? `Cześć, ${firstName}` : 'Cześć'}</p>
        <h1>Konto czeka na weryfikację</h1>
        <p className="panel-subtitle">
          Twoje konto specjalisty zostało utworzone. Zanim otworzy się panel,
          musi je jeszcze zatwierdzić administrator fundacji.
        </p>
      </div>

      <section className="panel-section" aria-labelledby="pending-heading">
        <div className="panel-card">
          <h2 id="pending-heading" className="panel-card-title">
            Co dalej
          </h2>
          <p className="panel-note">
            Do czasu weryfikacji nie możesz zapraszać pacjentów, wystawiać kodów
            dla opiekunów, dodawać technik ani zakładać kont innym specjalistom.
            Nie musisz nic robić — gdy administrator zatwierdzi konto, panel
            otworzy się przy następnym logowaniu albo po kliknięciu przycisku
            poniżej.
          </p>
        </div>

        {error && (
          <p className="panel-error" role="alert">
            {error}
          </p>
        )}
        {stillWaiting && (
          <p className="panel-status" role="status">
            Konto nadal czeka na weryfikację.
          </p>
        )}
        <button
          type="button"
          className="panel-button"
          onClick={() => void check()}
          disabled={checking}
        >
          {checking ? 'Sprawdzanie…' : 'Sprawdź ponownie'}
        </button>
      </section>
    </div>
  )
}

export default SpecialistPending
