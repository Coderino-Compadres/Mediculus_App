import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import {
  approveSpecialist,
  fetchOverview,
  fetchPendingSpecialists,
  personLabel,
  rejectSpecialist,
  type Overview,
  type PendingSpecialist,
} from '../api/admin'
import { useAuth } from '../auth/authContext'
import { linkedSinceLabel } from '../utils/children'
import { adminAccountPath, ROUTES, routeTitle } from '../routes'
import '../styles/panel.css'
import './home.css'
import './specialist.css'
import './admin.css'

const PENDING_LOAD_ERROR = 'Nie udało się wczytać kont do weryfikacji. Spróbuj ponownie.'
const OVERVIEW_LOAD_ERROR = 'Nie udało się wczytać statystyk. Spróbuj ponownie.'
const DECISION_ERROR = 'Nie udało się zapisać decyzji. Spróbuj ponownie.'

/**
 * "Panel administratora" — the two jobs of the administrator's account.
 *
 * 1. THE SPECIALIST ACCOUNTS WAITING FOR A DECISION, first, because each is a
 *    person who cannot work until it is answered. A colleague created the
 *    account and vouched for them; this is the foundation's final word.
 *    Approving opens their panel. Rejecting **deletes the account** — which is
 *    why it asks twice, inline rather than in a browser dialog, and says so in
 *    the button itself.
 * 2. THE OVERVIEW: how many of everything, naming nobody, and the way into the
 *    read-only account list and the audit log.
 *
 * WHAT THE ADMINISTRATOR DOES NOT SEE is any record's content. The backend
 * sends identity from user_db and counts from medical_db (core/admin_panel.py),
 * and every look at an account is written to the audit log — the scope note at
 * the bottom says both, so the person using the panel knows it too.
 */
function AdminHome() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? ''

  const [pending, setPending] = useState<PendingSpecialist[]>([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [pendingAttempt, setPendingAttempt] = useState(0)

  const [overview, setOverview] = useState<Overview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewAttempt, setOverviewAttempt] = useState(0)

  // Which row is being decided, and which one is asking "are you sure".
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPendingSpecialists()
      .then((rows) => {
        if (cancelled) return
        setPending(rows)
        setPendingError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setPendingError((cause instanceof ApiError && cause.formMessage) || PENDING_LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setPendingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pendingAttempt])

  useEffect(() => {
    let cancelled = false
    fetchOverview()
      .then((data) => {
        if (cancelled) return
        setOverview(data)
        setOverviewError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setOverviewError((cause instanceof ApiError && cause.formMessage) || OVERVIEW_LOAD_ERROR)
      })
    return () => {
      cancelled = true
    }
  }, [overviewAttempt])

  async function decide(specialist: PendingSpecialist, approve: boolean) {
    setBusyId(specialist.id)
    setDecisionError(null)
    setNotice(null)
    try {
      const rows = approve
        ? await approveSpecialist(specialist.id)
        : await rejectSpecialist(specialist.id)
      setPending(rows)
      setConfirmingId(null)
      setNotice(
        approve
          ? `Zatwierdzono konto: ${personLabel(specialist)}.`
          : `Odrzucono i usunięto konto: ${personLabel(specialist)}.`,
      )
      // The counts above changed with the decision.
      setOverviewAttempt((value) => value + 1)
    } catch (cause: unknown) {
      setDecisionError((cause instanceof ApiError && cause.formMessage) || DECISION_ERROR)
      // A 404 means somebody else decided first; the list says what is left.
      if (cause instanceof ApiError && cause.status === 404) {
        setPendingAttempt((value) => value + 1)
      }
    } finally {
      setBusyId(null)
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
        <h1>Panel administratora</h1>
        <p className="panel-subtitle">
          Weryfikacja kont specjalistów i przegląd danych w bazie.
        </p>
      </div>

      <section className="panel-section" aria-labelledby="admin-pending-heading">
        <h2 id="admin-pending-heading" className="panel-section-heading">
          Konta specjalistów do weryfikacji
          {pending.length > 0 && <span className="admin-count">{pending.length}</span>}
        </h2>

        {notice && (
          <p className="panel-success" role="status">
            {notice}
          </p>
        )}
        {decisionError && (
          <p className="panel-error" role="alert">
            {decisionError}
          </p>
        )}

        {pendingLoading && (
          <div className="panel-loading" role="status" aria-busy="true">
            Wczytywanie…
          </div>
        )}
        {!pendingLoading && pendingError && (
          <LoadError
            className="panel-empty"
            message={pendingError}
            onRetry={() => setPendingAttempt((value) => value + 1)}
          />
        )}
        {!pendingLoading && !pendingError && pending.length === 0 && (
          <p className="panel-empty">Żadne konto nie czeka na weryfikację.</p>
        )}
        {!pendingLoading &&
          !pendingError &&
          pending.map((specialist) => {
            const busy = busyId === specialist.id
            const confirming = confirmingId === specialist.id
            const created = linkedSinceLabel(specialist.createdAt)
            return (
              <article
                key={specialist.id}
                className="panel-card admin-pending"
                aria-label={personLabel(specialist)}
              >
                <p className="specialist-list-title">
                  <Link className="admin-name-link" to={adminAccountPath(specialist.id)}>
                    {personLabel(specialist)}
                  </Link>
                </p>
                <p className="specialist-list-meta">{specialist.email}</p>
                <p className="specialist-list-meta">
                  {[specialist.specialization, specialist.moduleLabel].filter(Boolean).join(' · ')}
                </p>
                <p className="specialist-list-meta">
                  {specialist.createdBy
                    ? `Konto założył(a): ${personLabel(specialist.createdBy)}`
                    : 'Nie wiadomo, kto założył konto'}
                  {created && ` · ${created}`}
                </p>
                <p className="specialist-list-meta">
                  {specialist.consentsActive && specialist.passwordSet
                    ? 'Właściciel konta udzielił zgód i ustawił własne hasło.'
                    : 'Właściciel konta jeszcze się nie zalogował (zgody RODO i własne hasło).'}
                </p>

                {confirming ? (
                  <div className="admin-confirm" role="group" aria-label="Potwierdzenie odrzucenia">
                    <p className="panel-error">
                      Odrzucenie usuwa konto na stałe. Tej decyzji nie da się cofnąć.
                    </p>
                    <div className="specialist-list-actions">
                      <button
                        type="button"
                        className="panel-button admin-danger"
                        disabled={busy}
                        onClick={() => void decide(specialist, false)}
                      >
                        {busy ? 'Usuwanie…' : 'Tak, odrzuć i usuń konto'}
                      </button>
                      <button
                        type="button"
                        className="panel-button-quiet"
                        disabled={busy}
                        onClick={() => setConfirmingId(null)}
                      >
                        Anuluj
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="specialist-list-actions admin-actions">
                    <button
                      type="button"
                      className="panel-button"
                      disabled={busy || busyId !== null}
                      onClick={() => void decide(specialist, true)}
                    >
                      {busy ? 'Zapisywanie…' : 'Zatwierdź'}
                    </button>
                    <button
                      type="button"
                      className="panel-button-secondary"
                      disabled={busyId !== null}
                      onClick={() => {
                        setNotice(null)
                        setConfirmingId(specialist.id)
                      }}
                    >
                      Odrzuć
                    </button>
                  </div>
                )}
              </article>
            )
          })}
      </section>

      <section className="panel-section" aria-labelledby="admin-overview-heading">
        <h2 id="admin-overview-heading" className="panel-section-heading">
          Przegląd
        </h2>
        {overviewError && (
          <LoadError
            className="panel-empty"
            message={overviewError}
            onRetry={() => setOverviewAttempt((value) => value + 1)}
          />
        )}
        {!overviewError && !overview && (
          <div className="panel-loading" role="status" aria-busy="true">
            Wczytywanie…
          </div>
        )}
        {!overviewError && overview && (
          <>
            <div className="panel-card">
              <h3 className="panel-card-title">Konta</h3>
              <div className="panel-figures">
                <Figure value={overview.accounts.total} label="wszystkie" />
                <Figure value={overview.accounts.patient} label="pacjenci" />
                <Figure value={overview.patients.minors} label="w tym małoletni" />
                <Figure value={overview.accounts.specialist} label="specjaliści" />
                <Figure value={overview.specialists.pending} label="do weryfikacji" />
                <Figure value={overview.accounts.guardian} label="opiekunowie" />
              </div>
            </div>
            <div className="panel-card">
              <h3 className="panel-card-title">Powiązania</h3>
              <div className="panel-figures">
                <Figure value={overview.care_links.accepted} label="pacjent–specjalista" />
                <Figure value={overview.care_links.pending} label="zaproszenia bez odpowiedzi" />
                <Figure value={overview.guardian_links.accepted} label="dziecko–opiekun" />
                <Figure value={overview.guardian_links.pending} label="czekają na opiekuna" />
              </div>
            </div>
            <div className="panel-card">
              <h3 className="panel-card-title">Wpisy w bazie medycznej</h3>
              <div className="panel-figures">
                <Figure value={overview.records.diary_entries} label="wpisy w dzienniczku" />
                <Figure value={overview.records.meals} label="posiłki" />
                <Figure value={overview.records.hydration_entries} label="nawodnienie" />
                <Figure value={overview.records.activities} label="aktywności" />
                <Figure value={overview.records.sleep_nights} label="noce snu" />
                <Figure value={overview.records.supplements} label="suplementy i leki" />
              </div>
              <p className="panel-note admin-figures-note">
                Same liczby — treść wpisów nie jest dostępna w panelu administratora.
              </p>
            </div>
          </>
        )}
      </section>

      <section className="panel-section" aria-labelledby="admin-tools-heading">
        <h2 id="admin-tools-heading" className="panel-section-heading">
          Narzędzia
        </h2>
        <Link className="specialist-tool" to={ROUTES.adminAccounts}>
          <span className="specialist-tool-title">{routeTitle(ROUTES.adminAccounts)}</span>
          <span className="specialist-tool-text">
            Wszystkie konta: pacjenci, specjaliści, opiekunowie i administratorzy,
            z powiązaniami między nimi. Tylko do odczytu.
          </span>
          <span className="specialist-tool-arrow" aria-hidden="true">
            →
          </span>
        </Link>
        <Link className="specialist-tool" to={ROUTES.adminAuditLog}>
          <span className="specialist-tool-title">{routeTitle(ROUTES.adminAuditLog)}</span>
          <span className="specialist-tool-text">
            Kto z administratorów co przeglądał i jakie decyzje podjął.
          </span>
          <span className="specialist-tool-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </section>

      <section className="panel-quiet specialist-scope" aria-labelledby="admin-scope-heading">
        <h2 id="admin-scope-heading">Zakres dostępu</h2>
        <p>
          Widzisz dane kont i powiązania między nimi oraz liczby wpisów. Nie
          widzisz treści dzienniczków, raportów ani profili zdrowotnych. Każde
          otwarcie konta i każda decyzja są zapisywane w dzienniku działań.
        </p>
      </section>
    </div>
  )
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="panel-figure">
      <span className="panel-figure-value">{value}</span>
      <span className="panel-figure-label">{label}</span>
    </div>
  )
}

export default AdminHome
