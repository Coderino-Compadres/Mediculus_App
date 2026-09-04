import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  dropPatient,
  fetchCaseload,
  invitePatient,
  type SpecialistCaseload,
  type SpecialistPatient,
} from '../api/specialist'
import { entryDateLabel, lastEntryLabel, showsStreak } from '../utils/children'
import { patientLabel } from '../utils/specialist'
import { pluralDays } from '../utils/reports'
import { specialistPatientReportsPath } from '../routes'
import './specialistPatients.css'

/**
 * "Moi pacjenci" — the caseload, and the form that asks somebody to join it.
 *
 * TWO LISTS, NEVER ONE. Accepted patients and outstanding invitations are drawn
 * apart, because a pending invitation grants nothing at all: no reports, no
 * figures, nothing. A single list with a status badge is exactly the shape in
 * which somebody eventually renders a "Raporty" link on a row that has not
 * agreed to anything.
 *
 * WHAT A ROW SHOWS is identity and engagement — has this person been writing,
 * when did they last. The clinical content is one screen further in, in the
 * weekly reports, and it stays there deliberately: a mood average sitting in a
 * list of nine patients is read at a glance and understood as a score, which is
 * not what it is. See PATIENT_SUMMARY_FIELDS in core/specialist.py.
 *
 * THE INVITE FORM SAYS ONE THING WHEN IT REFUSES, and that is not laziness: an
 * unknown address, an address belonging to a guardian, and a patient who already
 * has a specialist all answer identically, so this form cannot be used to ask
 * who has an account here and what kind of care they are in. The way out of a
 * mistyped address is the patient sitting in front of you.
 */

const LOAD_ERROR = 'Nie udało się wczytać listy pacjentów.'
const INVITE_ERROR = 'Nie udało się wysłać zaproszenia. Spróbuj ponownie.'
const DROP_ERROR = 'Nie udało się zapisać zmiany. Spróbuj ponownie.'

function Figure({ value, label, title }: { value: string; label: string; title?: string }) {
  return (
    <div className="caseload-figure" title={title}>
      <span className="caseload-figure-value">{value}</span>
      <span className="caseload-figure-label">{label}</span>
    </div>
  )
}

function PatientCard({
  patient,
  onDrop,
  busy,
}: {
  patient: SpecialistPatient
  onDrop: () => void
  busy: boolean
}) {
  const { activity } = patient

  return (
    <article className="caseload-card">
      <header className="caseload-card-header">
        <h3>{patientLabel(patient)}</h3>
        {patient.email && <p className="caseload-card-email">{patient.email}</p>}
        {/* Only for a minor, and it is here because it changes what the
            specialist can do next: a guardian account is issued for a minor. */}
        {patient.isChild === true && (
          <p className="caseload-card-tag">Pacjent małoletni</p>
        )}
      </header>

      {activity && (
        <div className="caseload-figures">
          <Figure
            value={String(activity.entryCount)}
            label={activity.entryCount === 1 ? 'wpis' : 'wpisów'}
          />
          {showsStreak(activity.streakDays) && (
            <Figure
              value={String(activity.streakDays)}
              label={`${pluralDays(activity.streakDays)} z rzędu`}
            />
          )}
          <Figure
            value={lastEntryLabel(activity.lastEntryDate, new Date()) ?? '—'}
            label="ostatni wpis"
            title={entryDateLabel(activity.lastEntryDate) ?? undefined}
          />
        </div>
      )}

      {activity?.entryCount === 0 && (
        <p className="caseload-card-note">
          Ten pacjent nie zapisał jeszcze żadnego wpisu, więc nie ma jeszcze raportów.
        </p>
      )}

      <div className="caseload-card-actions">
        <Link className="caseload-card-link" to={specialistPatientReportsPath(patient.id)}>
          Raporty tygodniowe →
        </Link>
        <button
          type="button"
          className="caseload-card-drop"
          onClick={onDrop}
          disabled={busy}
        >
          Zakończ opiekę
        </button>
      </div>
    </article>
  )
}

function SpecialistPatients() {
  const [caseload, setCaseload] = useState<SpecialistCaseload>({ patients: [], pending: [] })
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Separate from `failed`: a change that did not go through is not a list that
  // did not load, and saying the latter sends the specialist to reload a screen
  // whose content is already right.
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    fetchCaseload()
      .then((answer) => {
        if (live) setCaseload(answer)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [])

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setInviting(true)
    setInviteError(null)
    setInvited(null)
    try {
      setCaseload(await invitePatient(email.trim()))
      setInvited(
        `Zaproszenie wysłane na ${email.trim()}. Pacjent zobaczy je na swojej stronie głównej.`,
      )
      setEmail('')
    } catch (cause: unknown) {
      setInviteError(
        (cause instanceof ApiError &&
          (cause.fieldErrors.patient_email || cause.formMessage)) ||
          INVITE_ERROR,
      )
    } finally {
      setInviting(false)
    }
  }

  async function drop(patient: SpecialistPatient) {
    setBusyId(patient.id)
    setActionError(null)
    try {
      setCaseload(await dropPatient(patient.id))
    } catch (cause: unknown) {
      setActionError(
        cause instanceof ApiError && cause.status === 404
          ? `${patientLabel(patient)} nie jest już Twoim pacjentem.`
          : DROP_ERROR,
      )
      // The row is gone on the server either way, so the list is re-read rather
      // than left showing a patient who is not there.
      if (cause instanceof ApiError && cause.status === 404) {
        fetchCaseload().then(setCaseload).catch(() => setFailed(true))
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="caseload-section" aria-labelledby="caseload-heading">
      <h2 id="caseload-heading" className="caseload-heading">
        Moi pacjenci
      </h2>

      {loading && (
        <p className="caseload-status" role="status" aria-busy="true">
          Wczytywanie listy pacjentów…
        </p>
      )}

      {/* A failed load must not look like an empty caseload: a specialist who
          reads "nie masz pacjentów" will go looking for the invitation form
          rather than for the reason. */}
      {!loading && failed && (
        <p className="caseload-error" role="alert">
          {LOAD_ERROR}
        </p>
      )}

      {!loading && !failed && (
        <>
          {caseload.patients.length === 0 && (
            <p className="caseload-empty">
              Nie masz jeszcze pacjentów. Zaproś pacjenta poniżej — dopóki nie
              potwierdzi zaproszenia, nie widzisz żadnych jego danych.
            </p>
          )}

          {caseload.patients.map((patient) => (
            <PatientCard
              key={patient.id}
              patient={patient}
              busy={busyId === patient.id}
              onDrop={() => void drop(patient)}
            />
          ))}

          {caseload.pending.length > 0 && (
            <div className="caseload-pending">
              <h3 className="caseload-pending-heading">Oczekujące zaproszenia</h3>
              {/* Said in words on the screen, not only enforced in the API: a
                  specialist who thinks an invitation is access will wonder why
                  the reports are missing instead of asking the patient. */}
              <p className="caseload-pending-note">
                Zaproszony pacjent musi je potwierdzić w swojej aplikacji. Do tego
                czasu nie widzisz żadnych jego danych.
              </p>
              {caseload.pending.map((patient) => (
                <div key={patient.id} className="caseload-pending-row">
                  <span>{patientLabel(patient)}</span>
                  <button
                    type="button"
                    className="caseload-card-drop"
                    onClick={() => void drop(patient)}
                    disabled={busyId === patient.id}
                  >
                    Anuluj
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {actionError && (
        <p className="caseload-error" role="alert">
          {actionError}
        </p>
      )}

      <form className="caseload-invite" onSubmit={(event) => void invite(event)} noValidate>
        <h3 className="caseload-invite-heading">Zaproś pacjenta</h3>
        <label htmlFor="caseload-invite-email">Adres e-mail pacjenta</label>
        <div className="caseload-invite-row">
          <input
            id="caseload-invite-email"
            name="patientEmail"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(inviteError)}
            aria-describedby={inviteError ? 'caseload-invite-error' : undefined}
          />
          <button type="submit" disabled={inviting || email.trim() === ''}>
            {inviting ? 'Wysyłanie…' : 'Zaproś'}
          </button>
        </div>
        {inviteError && (
          <p id="caseload-invite-error" className="caseload-error" role="alert">
            {inviteError}
          </p>
        )}
        {invited && (
          <p className="caseload-success" role="status">
            {invited}
          </p>
        )}
        <p className="caseload-invite-note">
          Pacjent decyduje sam. Po potwierdzeniu widzisz jego raporty tygodniowe —
          nie widzisz treści dzienniczka.
        </p>
      </form>
    </section>
  )
}

export default SpecialistPatients
