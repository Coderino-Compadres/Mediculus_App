import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import {
  ACCOUNT_KIND_LABELS,
  fetchAccount,
  personLabel,
  type AccountDetail,
  type Link as AccountLink,
  type Person,
  type Tally,
} from '../api/admin'
import { roleLabel } from '../utils/roles'
import { linkedSinceLabel } from '../utils/children'
import { adminAccountPath, ROUTES } from '../routes'
import './journals.css'
import '../styles/panel.css'
import './specialist.css'
import './admin.css'

const LOAD_ERROR = 'Nie udało się wczytać konta. Spróbuj ponownie.'
const NOT_FOUND = 'Nie ma takiego konta. Mogło zostać usunięte.'

const GUARDIAN_STATUS_LABELS: Record<string, string> = {
  none: 'nie wskazano opiekuna',
  pending: 'opiekun jeszcze nie zatwierdził',
  accepted: 'zatwierdzone przez opiekuna',
}

/** 'YYYY-MM-DD' → "1 września 2026". A calendar day, so no time zone applies. */
function dayLabel(day: string | null): string | null {
  if (!day) return null
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  return new Date(year, month - 1, date).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * "Szczegóły konta" — one account and every link it is part of, read-only.
 *
 * What is here is user_db: identity, account state, who treats whom and who
 * vouches for whom. For a patient, medical_db contributes a count and a last
 * date per diary — `core.admin_panel._activity` asks each table for nothing
 * else, so no entry's content can reach this screen.
 *
 * Opening it is written to the audit log with the account's name; the note at
 * the bottom says so. A 404 is its own message rather than the load error: an
 * account that was rejected a minute ago is gone, and "try again" would not
 * bring it back.
 */
function AdminAccount() {
  const { id = '' } = useParams()
  // Keyed by the id, so following a link to another account starts from a
  // fresh loading state rather than showing the previous one's name.
  return <AccountScreen key={id} id={id} />
}

function AccountScreen({ id }: { id: string }) {
  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [attempt, setAttempt] = useState(0)

  function retry() {
    setLoading(true)
    setLoadError(null)
    setAttempt((value) => value + 1)
  }

  useEffect(() => {
    let cancelled = false
    fetchAccount(id)
      .then((detail) => {
        if (!cancelled) setAccount(detail)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 404) setNotFound(true)
        else setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL ADMINISTRATORA</p>
          <h1>{account && !loading ? personLabel(account) : 'Szczegóły konta'}</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.adminAccounts}>
        ← Wróć do listy kont
      </Link>

      {loading && (
        <div className="panel-loading" role="status" aria-busy="true">
          Wczytywanie…
        </div>
      )}
      {!loading && notFound && <p className="panel-empty">{NOT_FOUND}</p>}
      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}
      {!loading && !notFound && !loadError && account && <AccountSections account={account} />}
    </div>
  )
}

function AccountSections({ account }: { account: AccountDetail }) {
  const { specialist, patient, guardian } = account
  return (
    <>
      <section className="panel-card" aria-labelledby="admin-account-heading">
        <h2 id="admin-account-heading" className="panel-card-title">
          Dane konta
        </h2>
        <dl className="admin-facts">
          <Fact term="Rodzaj konta" value={ACCOUNT_KIND_LABELS[account.kind]} />
          <Fact term="Rola" value={account.role ? roleLabel(account.role) : null} />
          <Fact term="Adres e-mail" value={account.email} />
          <Fact term="Data urodzenia" value={dayLabel(account.dateOfBirth)} />
          <Fact term="Utworzone" value={linkedSinceLabel(account.createdAt)} />
          <Fact term="Ostatnia zmiana" value={linkedSinceLabel(account.updatedAt)} />
          <Fact term="Zgody RODO" value={account.consentsActive ? 'aktywne' : 'nieaktywne'} />
          <Fact
            term="Hasło"
            value={account.mustChangePassword ? 'tymczasowe, do zmiany' : 'ustawione przez właściciela'}
          />
        </dl>
      </section>

      {specialist && (
        <section className="panel-card" aria-labelledby="admin-specialist-heading">
          <h2 id="admin-specialist-heading" className="panel-card-title">
            Konto specjalisty
          </h2>
          <dl className="admin-facts">
            <Fact term="Specjalizacja" value={specialist.specialization} />
            <Fact term="Moduł" value={specialist.moduleLabel} />
            <Fact
              term="Weryfikacja"
              value={
                specialist.approvedAt
                  ? `zatwierdzone ${linkedSinceLabel(specialist.approvedAt) ?? ''}`.trim()
                  : 'czeka na decyzję administratora'
              }
            />
            <div className="admin-fact">
              <dt>Konto założył(a)</dt>
              <dd>{specialist.createdBy ? <PersonLink person={specialist.createdBy} /> : '—'}</dd>
            </div>
          </dl>
          {!specialist.approvedAt && (
            <p className="panel-note">
              Decyzję podejmiesz na <Link to={ROUTES.adminHome}>stronie głównej panelu</Link>.
            </p>
          )}
          <LinkList
            heading="Pacjenci"
            links={specialist.patients}
            empty="Żaden pacjent nie jest powiązany z tym specjalistą."
          />
        </section>
      )}

      {patient && (
        <section className="panel-card" aria-labelledby="admin-patient-heading">
          <h2 id="admin-patient-heading" className="panel-card-title">
            Konto pacjenta
          </h2>
          <dl className="admin-facts">
            <Fact
              term="Wiek"
              value={
                patient.isChild === null ? null : patient.isChild ? 'małoletni' : 'pełnoletni'
              }
            />
            {patient.guardianStatus && (
              <Fact
                term="Opiekun"
                value={GUARDIAN_STATUS_LABELS[patient.guardianStatus] ?? patient.guardianStatus}
              />
            )}
          </dl>
          <LinkList
            heading="Specjaliści"
            links={patient.specialists}
            empty="Pacjent nie jest powiązany z żadnym specjalistą."
          />
          <LinkList
            heading="Opiekunowie"
            links={patient.guardians}
            empty="Pacjent nie jest powiązany z żadnym opiekunem."
          />
          <h3 className="admin-subheading">Aktywność</h3>
          <div className="panel-figures">
            <TallyFigure tally={patient.activity.diaryEntries} label="wpisy w dzienniczku" />
            <TallyFigure tally={patient.activity.meals} label="posiłki" />
            <TallyFigure tally={patient.activity.hydrationEntries} label="nawodnienie" />
            <TallyFigure tally={patient.activity.activities} label="aktywności" />
            <TallyFigure tally={patient.activity.sleepNights} label="noce snu" />
            <div className="panel-figure">
              <span className="panel-figure-value">{patient.activity.supplements}</span>
              <span className="panel-figure-label">suplementy i leki</span>
            </div>
          </div>
          <p className="panel-note admin-figures-note">
            Profil zdrowotny: {patient.activity.healthProfile ? 'wypełniony' : 'niewypełniony'}.
            Treść wpisów nie jest dostępna w panelu administratora.
          </p>
        </section>
      )}

      {guardian && (
        <section className="panel-card" aria-labelledby="admin-guardian-heading">
          <h2 id="admin-guardian-heading" className="panel-card-title">
            Konto opiekuna
          </h2>
          <LinkList
            heading="Dzieci"
            links={guardian.children}
            empty="Opiekun nie jest powiązany z żadnym dzieckiem."
          />
        </section>
      )}

      <p className="panel-note">To otwarcie konta zostało zapisane w dzienniku działań.</p>
    </>
  )
}

function Fact({ term, value }: { term: string; value: string | null }) {
  return (
    <div className="admin-fact">
      <dt>{term}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

function PersonLink({ person }: { person: Person }) {
  return (
    <Link className="admin-name-link" to={adminAccountPath(person.id)}>
      {personLabel(person)}
    </Link>
  )
}

function LinkList({ heading, links, empty }: { heading: string; links: AccountLink[]; empty: string }) {
  return (
    <>
      <h3 className="admin-subheading">{heading}</h3>
      {links.length === 0 ? (
        <p className="panel-note">{empty}</p>
      ) : (
        <ul className="admin-links">
          {links.map((link) => (
            <li key={`${link.id}-${link.moduleLabel ?? ''}`}>
              <PersonLink person={link} />
              <span className="specialist-list-meta">
                {[link.moduleLabel, link.accepted ? 'zaakceptowane' : 'czeka na odpowiedź']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function TallyFigure({ tally, label }: { tally: Tally; label: string }) {
  const last = dayLabel(tally.last)
  return (
    <div className="panel-figure">
      <span className="panel-figure-value">{tally.count}</span>
      <span className="panel-figure-label">{label}</span>
      {last && <span className="panel-figure-label">ostatni: {last}</span>}
    </div>
  )
}

export default AdminAccount
