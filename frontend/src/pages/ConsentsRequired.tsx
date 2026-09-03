import { useState } from 'react'
import { ApiError } from '../api/client'
import { restoreConsent } from '../api/account'
import { useAuth } from '../auth/authContext'
import { useSignOut } from '../hooks/useSignOut'
import { CONSENTS, CONSENT_IDS, type ConsentDefinition } from '../utils/consents'
import { consentDateLabel } from '../utils/profile'
import type { AuthUser } from '../api/auth'
import type { ConsentWithdrawalScope } from '../types/profile'
import '../components/auth.css'
import './consentsRequired.css'

/**
 * "Wymagane zgody" — the whole of the app for an account whose consents are not
 * in force.
 *
 * WHY A SCREEN AND NOT A DELETION. Withdrawing the health-data consent removes
 * the app's only lawful basis for processing anything, and the older reading of
 * that was that the account ends. It is one way to stop processing and the
 * harshest: it makes exercising a right (art. 7(3)) indistinguishable from
 * destroying your own record, and it is not reversible an hour later when the
 * person changes their mind. So the account is *locked* instead — nothing is
 * read, nothing is written, nothing is shown — and this is the one screen that
 * answers. Deleting the account is still available, as its own decision, which
 * is where irreversibility belongs.
 *
 * THE GATE IS NOT THIS SCREEN. `App.tsx` sends every other route here, and
 * `core/permissions.py` refuses every endpoint but four on the server. A route
 * guard alone would be a suggestion: the point of a lawful basis is that it
 * binds the part of the system that actually touches the data.
 *
 * WHAT IT MUST NOT DO. It does not argue, does not warn, and does not hide the
 * way out. Withdrawing a consent is a right, not a mistake, and a screen that
 * made restoring feel like the only escape from a trap would be pressuring
 * somebody into a consent — which is precisely the thing that makes consent
 * invalid (art. 7(4): freely given). Hence "Wyloguj się" sitting next to the
 * restore buttons at the same weight, and a tone that states the consequence
 * rather than dramatising it.
 */

const RESTORE_ERROR = 'Nie udało się zapisać zgody. Spróbuj ponownie.'

/**
 * One consent's state, as the server reported it.
 *
 * **Read, never recomputed**, and that is the fix for the bug this screen
 * shipped with. It used to derive `active` here by comparing the two timestamps
 * — and the payload rendered them in different zones, so comparing the strings
 * said a withdrawn consent still held. The screen then showed "Udzielona" and no
 * restore button, which left the account with nowhere to go but the logout
 * link. `core/consents.is_active` is the single definition of this; a second one
 * in the browser is a second one free to disagree with the gate.
 */
function stateOf(user: AuthUser, id: ConsentDefinition['id']) {
  return id === CONSENT_IDS.data ? user.consents.data : user.consents.services
}

/** Which consents this account is missing, in the order both screens list them. */
function missingConsents(user: AuthUser): ConsentDefinition[] {
  return CONSENTS.filter((consent) => !stateOf(user, consent.id).active)
}

function ConsentsRequired() {
  const { user, setUser } = useAuth()
  const signOutAndLeave = useSignOut()
  const [busy, setBusy] = useState<ConsentWithdrawalScope | null>(null)
  const [failed, setFailed] = useState(false)

  // RequireConsents guarantees a user by the time this renders; the guard is for
  // the type.
  if (!user) return null

  const missing = missingConsents(user)

  async function restore(scope: ConsentWithdrawalScope) {
    setBusy(scope)
    setFailed(false)
    try {
      // The answer carries the updated account, so handing it to the session is
      // what lets App.tsx's guard move the app back out of this screen — no
      // second request, and no window in which the two disagree.
      setUser(await restoreConsent(scope))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="consents-page">
      <section className="consents-card" aria-labelledby="consents-heading">
        <h1 id="consents-heading">Bez zgód nie możemy prowadzić Twojego konta</h1>
        <p className="consents-lead">
          Mediculus przetwarza dane o zdrowiu i robi to wyłącznie na podstawie Twoich zgód.
          Dopóki ich nie ma, konto jest zatrzymane: nie otwieramy dzienniczka, nie liczymy
          raportów i nie pokazujemy żadnych danych.
        </p>
        <p className="consents-lead">
          {/* Said plainly and early, because it is the thing somebody in this
              situation most needs to know and the thing the older "wycofanie
              kończy konto" wording got wrong. */}
          <strong>Nic nie zostało usunięte.</strong> Twoje wpisy czekają na miejscu i wrócą
          w tym samym stanie, jeśli przywrócisz zgody.
        </p>

        <div className="consents-list">
          {CONSENTS.map((consent) => {
            const { active, withdrawnAt } = stateOf(user!, consent.id)
            const withdrawnOn = active ? null : consentDateLabel(withdrawnAt ?? '')
            const scope: ConsentWithdrawalScope =
              consent.id === CONSENT_IDS.data ? 'data' : 'services'

            return (
              <div className="consent-item" key={consent.id}>
                <div className="consent-item-head">
                  <span className="consent-item-name">{consent.shortLabel}</span>
                  <span
                    className={
                      active
                        ? 'consent-item-status'
                        : 'consent-item-status consent-item-status-missing'
                    }
                  >
                    {active ? 'Udzielona' : 'Wycofana'}
                  </span>
                </div>
                {/* Verbatim from utils/consents.ts — the same sentence the
                    registration form asked, so what is being given back is
                    recognisably what was given. */}
                <p className="consent-item-quote">{consent.label}</p>
                {withdrawnOn && (
                  <p className="consent-item-quote">Wycofana {withdrawnOn}.</p>
                )}
                {!active && (
                  <button
                    type="button"
                    className="auth-submit"
                    disabled={busy !== null}
                    onClick={() => void restore(scope)}
                  >
                    {busy === scope ? 'Zapisywanie…' : 'Przywróć tę zgodę'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {failed && (
          <p className="consents-error" role="alert">
            {RESTORE_ERROR}
          </p>
        )}

        <div className="consents-actions">
          {missing.length > 1 && (
            <button
              type="button"
              className="auth-submit"
              disabled={busy !== null}
              onClick={() => void restore('all')}
            >
              {busy === 'all' ? 'Zapisywanie…' : 'Przywróć obie zgody'}
            </button>
          )}
          {/* At the same weight as the buttons above, on purpose. A screen that
              made restoring the only way out would be pressuring somebody into
              a consent, and a consent given under pressure is not one (art.
              7(4)). Leaving is always available. */}
          <button
            type="button"
            className="auth-submit auth-submit-secondary"
            onClick={() => void signOutAndLeave()}
          >
            Wyloguj się
          </button>
        </div>

        <p className="consents-note">
          Zgody możesz wycofać ponownie w każdej chwili — w profilu, w sekcji „Twoje dane
          i zgody”. Jeśli zamiast tego chcesz trwale usunąć konto wraz z danymi, napisz do
          Fundacji Mediculus.
        </p>
      </section>
    </div>
  )
}

export default ConsentsRequired
