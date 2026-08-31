import { useState } from 'react'
import { CONSENT_GRANTS } from '../data/profile'
import { PendingBackendError, requestDataExport } from '../api/account'
import { CONSENTS, type ConsentDefinition } from '../utils/consents'
import { consentDateLabel } from '../utils/profile'
import type { AccountClosureReason } from '../types/profile'

/**
 * "Twoje dane i zgody" — the consents, the export, and the way out.
 *
 * Not in the mockup, and not an extra either. The "Bezpieczeństwo" section of the
 * requirements names three things by hand — full control over the consents that
 * were given, an export of all the user's data, and permanent deletion of the
 * account with its data — and this app processes health data (registration cites
 * RODO art. 9) and is meant to be used by minors as well. That makes these
 * obligations rather than features. RODO art. 7(3) adds the shape: withdrawing a
 * consent has to be as easy as giving it, and giving it is one tap on a
 * registration form, while withdrawing it did not exist anywhere in the app.
 *
 * Which is why the section is here on the screen, in full, rather than behind a
 * TODO. What is behind a TODO is only the *execution* — see api/account.ts.
 *
 * The two consents were collected separately, so they have to be withdrawable
 * separately (art. 7(3) again: consent is per purpose). Three paths, because
 * withdrawing both at once is its own request rather than two runs through the
 * same one:
 *   1. only the health-data consent  -> the shared closure screen,
 *   2. only the services consent     -> its own screen, consequences undecided,
 *   3. both at once                  -> the shared closure screen.
 */

function ProfileDataRights({
  onOpenClosure,
  onOpenServicesWithdrawal,
}: {
  onOpenClosure: (reason: AccountClosureReason) => void
  onOpenServicesWithdrawal: () => void
}) {
  /**
   * Which screen a single consent's withdrawal leads to.
   *
   * Keyed on the consent's declared `withdrawalEffect`, not on its id. Keyed on
   * the id, a third consent added to CONSENTS would fall silently to the "else"
   * branch — landing on the "consequences undecided" screen and sending the
   * backend `scope: 'services'`, the wrong scope for a consent that ends the
   * account. The `never` assignment below is what makes a newly added effect a
   * compile error instead of a wrong screen.
   *
   * TODO: a *second* consent with 'ends-account' would reach the right screen but
   * carry the data consent's wording — `AccountClosureReason` would need an entry
   * of its own at that point.
   */
  function openWithdrawal(consent: ConsentDefinition) {
    switch (consent.withdrawalEffect) {
      case 'ends-account':
        onOpenClosure('withdraw-data-consent')
        return
      case 'undecided':
        onOpenServicesWithdrawal()
        return
      default: {
        const unhandled: never = consent.withdrawalEffect
        throw new Error(`Nieobsłużony skutek wycofania zgody: ${String(unhandled)}`)
      }
    }
  }

  // The export is a direct action rather than a screen — nothing about it is
  // irreversible — so its answer is a notice right here under the button.
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  async function onExport() {
    setExporting(true)
    setExportNotice(null)
    try {
      await requestDataExport()
      // TODO: unreachable until the endpoint exists; then this is where the file
      // (or the "we will e-mail it" answer) is handled.
    } catch (error) {
      setExportNotice(
        error instanceof PendingBackendError
          ? error.message
          : 'Nie udało się przygotować eksportu. Spróbuj ponownie.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="profile-card" aria-labelledby="profile-data-rights">
      <h2 id="profile-data-rights">Twoje dane i zgody</h2>
      <p className="profile-card-lead">
        Zgody, których udzieliłaś lub udzieliłeś przy zakładaniu konta, możesz wycofać w każdej
        chwili — osobno albo obie naraz. Możesz też pobrać wszystkie swoje dane lub trwale usunąć
        konto.
      </p>

      <div className="profile-consent-list">
        {CONSENTS.map((consent) => {
          const grant = CONSENT_GRANTS.find((entry) => entry.id === consent.id)
          return (
            <div key={consent.id} className="profile-consent">
              <div className="profile-consent-head">
                <span className="profile-consent-name">{consent.shortLabel}</span>
                {/* Read off the grant record rather than written in: a consent
                    register whose status can only ever say "granted" is the one
                    thing a consent register must not be. The moment a withdrawal
                    removes the record — or the day the two dates come from
                    `user.*_consent_at` instead of a constant — this says so on
                    its own. */}
                <span
                  className={
                    grant
                      ? 'profile-consent-status'
                      : 'profile-consent-status profile-consent-status-absent'
                  }
                >
                  {grant ? 'Udzielona' : 'Nieudzielona'}
                </span>
              </div>
              {/* Verbatim from utils/consents.ts, the same sentence the
                  registration form asked. A paraphrase here would mean the user
                  is withdrawing something they never read. */}
              <p className="profile-consent-quote">{consent.label}</p>
              {grant && (
                <p className="profile-consent-date">Udzielona {consentDateLabel(grant.grantedAt)}</p>
              )}
              {/* Nothing to withdraw when it was never given. */}
              {grant && (
                <button
                  type="button"
                  className="profile-inline-button"
                  onClick={() => openWithdrawal(consent)}
                >
                  Wycofaj tę zgodę
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* A path of its own, not a convenience: somebody who wants out of both
          should not have to go through the same confirmation twice. */}
      <button
        type="button"
        className="profile-secondary-button"
        onClick={() => onOpenClosure('withdraw-all-consents')}
      >
        Wycofaj obie zgody naraz
      </button>

      <div className="profile-subsection">
        <h3>Eksport danych</h3>
        <p className="profile-subsection-text">
          Pobierzesz wszystko, co aplikacja o Tobie przechowuje: wpisy z dzienniczka razem z ocenami
          nastroju i emocji, wygenerowane raporty tygodniowe oraz dane konta.
        </p>
        {/* TODO(klientka): the file format is not settled — PDF is what a person
            can open and reads like the weekly report; JSON is what RODO art. 20
            (portability) is actually about, being the form another controller
            could ingest. Possibly both. See api/account.ts. */}
        <button
          type="button"
          className="profile-secondary-button"
          onClick={() => void onExport()}
          disabled={exporting}
        >
          {exporting ? 'Przygotowywanie…' : 'Pobierz moje dane'}
        </button>
        {exportNotice && (
          <p className="profile-pending-notice" role="status">
            {exportNotice}
          </p>
        )}
      </div>

      <div className="profile-subsection">
        <h3>Usunięcie konta</h3>
        <p className="profile-subsection-text">
          Konto i zapisane w nim dane zostaną usunięte na stałe. Zanim to zrobisz, pokażemy
          dokładnie, co zniknie, i poprosimy o potwierdzenie.
        </p>
        <button
          type="button"
          className="profile-secondary-button profile-danger-outline"
          onClick={() => onOpenClosure('delete-account')}
        >
          Usuń konto
        </button>
      </div>
    </section>
  )
}

export default ProfileDataRights
