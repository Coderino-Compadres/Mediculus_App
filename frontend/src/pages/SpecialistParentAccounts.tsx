import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import SelectField from '../components/SelectField'
import { ApiError } from '../api/client'
import {
  createParentInvitation,
  fetchCaseload,
  fetchParentInvitations,
  revokeParentInvitation,
  type ParentInvitation,
  type SpecialistPatient,
} from '../api/specialist'
import { linkedSinceLabel } from '../utils/children'
import { patientLabel } from '../utils/specialist'
import { ROUTES } from '../routes'
import './journals.css'
import '../components/auth.css'
import './specialist.css'

/**
 * "Konta opiekunów" — where a specialist issues a code for a guardian's account.
 *
 * WHY A CODE. The guardian link is normally started by the child, who names an
 * address and waits for the adult to accept (RODO art. 8 — the consent a minor
 * cannot give for themselves). A specialist sitting with a family needs the
 * other direction, and this deployment sends no mail at all, so there is no
 * activation link to send: the code is handed over in the room, and the parent
 * finishes the registration with it. What the specialist supplies is the one
 * fact the app cannot check for itself — that these two people are a family.
 *
 * THE CODE IS SHOWN ONCE AND THE SCREEN SAYS SO. It is stored hashed, exactly as
 * a password is (core/parent_invitations.py), so nothing can read it back
 * afterwards — not this screen, not the list below, not the database. A
 * specialist who loses it revokes the invitation and issues a new one, which is
 * a worse outcome than seeing the code twice and a much better one than a
 * database full of usable invitations.
 *
 * ONLY FOR A MINOR PATIENT, because that is what `parent_child` is for. The
 * select below is filtered to this specialist's minor patients rather than
 * accepting a typed id: the backend refuses anyone else's patient, and an id
 * field would be a way to ask whether an account exists.
 */

const LOAD_ERROR = 'Nie udało się wczytać wystawionych zaproszeń. Spróbuj ponownie.'
const CREATE_ERROR = 'Nie udało się wystawić zaproszenia. Spróbuj ponownie.'
const REVOKE_ERROR = 'Nie udało się anulować zaproszenia. Spróbuj ponownie.'

const STATUS_LABELS: Record<ParentInvitation['status'], string> = {
  pending: 'Oczekuje na wykorzystanie',
  used: 'Konto zostało założone',
  expired: 'Kod wygasł',
}

function childName(invitation: ParentInvitation): string {
  const name = [invitation.childName?.trim(), invitation.childSurname?.trim()]
    .filter(Boolean)
    .join(' ')
  return name || invitation.childEmail?.trim() || 'pacjent'
}

function SpecialistParentAccounts() {
  const [minors, setMinors] = useState<SpecialistPatient[]>([])
  const [invitations, setInvitations] = useState<ParentInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)

  const [patientId, setPatientId] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The plaintext code, for as long as this screen is open. Deliberately not
  // persisted anywhere — see the header.
  const [issued, setIssued] = useState<{ code: string; invitation: ParentInvitation } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([fetchCaseload(), fetchParentInvitations()])
      .then(([caseload, issuedInvitations]) => {
        if (cancelled) return
        setMinors(caseload.patients.filter((patient) => patient.isChild === true))
        setInvitations(issuedInvitations)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setFormError(null)
    setIssued(null)
    try {
      const result = await createParentInvitation({ patientId, parentEmail: parentEmail.trim() })
      setIssued(result)
      setInvitations((current) => [result.invitation, ...current])
      setParentEmail('')
      setPatientId('')
    } catch (cause: unknown) {
      if (cause instanceof ApiError) {
        setErrors({
          patientId: cause.fieldErrors.patient_id ?? '',
          parentEmail: cause.fieldErrors.parent_email ?? '',
        })
        setFormError(cause.formMessage ?? (Object.keys(cause.fieldErrors).length ? null : CREATE_ERROR))
      } else {
        setFormError(CREATE_ERROR)
      }
    } finally {
      setSaving(false)
    }
  }

  async function revoke(invitation: ParentInvitation) {
    setBusyId(invitation.id)
    setActionError(null)
    try {
      setInvitations(await revokeParentInvitation(invitation.id))
      // The code on screen belonged to the invitation just withdrawn, so it must
      // not stay readable next to a list that no longer contains it.
      if (issued?.invitation.id === invitation.id) setIssued(null)
    } catch (cause: unknown) {
      setActionError(
        cause instanceof ApiError && cause.status === 404
          ? 'Tego zaproszenia nie można już anulować — mogło zostać wykorzystane.'
          : REVOKE_ERROR,
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL SPECJALISTY</p>
          <h1>Konta opiekunów</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistHome}>
        ← Wróć do panelu
      </Link>

      <p className="reports-intro">
        Wystaw kod, którym rodzic lub opiekun założy konto powiązane z Twoim
        małoletnim pacjentem. Kod przekazujesz mu osobiście — aplikacja nie
        wysyła wiadomości.
      </p>

      {issued && (
        /* The whole point of the screen, so it sits above the form rather than
           below it: a code that has scrolled off is a code that is lost. */
        <section className="specialist-code" aria-labelledby="specialist-code-heading">
          <h2 id="specialist-code-heading">Kod zaproszenia</h2>
          <p className="specialist-code-value">{issued.code}</p>
          <p className="specialist-code-note">
            Zapisz go teraz i przekaż opiekunowi. Nie zobaczysz go ponownie —
            jest przechowywany w postaci zaszyfrowanej. Jeśli go zgubisz, anuluj
            zaproszenie i wystaw nowe.
          </p>
          <p className="specialist-code-note">
            Opiekun rejestruje się na adres <strong>{issued.invitation.email}</strong>,
            wybiera „konto rodzica lub opiekuna” i wpisuje ten kod w formularzu
            rejestracji. Po rejestracji jego konto jest od razu powiązane z
            kontem {childName(issued.invitation)}.
          </p>
        </section>
      )}

      {loading && (
        <div className="journals-status" role="status" aria-busy="true">
          Wczytywanie…
        </div>
      )}

      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && (
        <>
          {minors.length === 0 ? (
            /* Not an error and not an empty form: without a minor patient there
               is nothing to issue an invitation *for*, and a form that could
               only fail would be worse than saying why. */
            <p className="journals-empty">
              Nie masz małoletnich pacjentów, którzy potwierdzili zaproszenie.
              Konto opiekuna zakłada się dla konkretnego małoletniego pacjenta.
            </p>
          ) : (
            <form className="specialist-form" onSubmit={(event) => void submit(event)} noValidate>
              <SelectField
                id="patientId"
                label="Pacjent"
                placeholder="Wybierz pacjenta"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                error={errors.patientId || null}
                options={minors.map((patient) => ({
                  value: patient.id,
                  label: patientLabel(patient),
                }))}
              />
              <div className="auth-field">
                <label htmlFor="parentEmail">Adres e-mail opiekuna</label>
                <input
                  id="parentEmail"
                  name="parentEmail"
                  type="email"
                  autoComplete="off"
                  value={parentEmail}
                  onChange={(event) => setParentEmail(event.target.value)}
                  aria-invalid={Boolean(errors.parentEmail)}
                  aria-describedby={errors.parentEmail ? 'parentEmail-error' : undefined}
                />
                {errors.parentEmail && (
                  <span id="parentEmail-error" className="auth-field-error">
                    {errors.parentEmail}
                  </span>
                )}
              </div>
              {formError && (
                <p className="caseload-error" role="alert">
                  {formError}
                </p>
              )}
              <button
                type="submit"
                className="specialist-form-submit"
                disabled={saving || patientId === '' || parentEmail.trim() === ''}
              >
                {saving ? 'Wystawianie…' : 'Wystaw kod'}
              </button>
            </form>
          )}

          <section className="specialist-list" aria-labelledby="specialist-list-heading">
            <h2 id="specialist-list-heading" className="caseload-heading">
              Wystawione zaproszenia
            </h2>
            {actionError && (
              <p className="caseload-error" role="alert">
                {actionError}
              </p>
            )}
            {invitations.length === 0 ? (
              <p className="journals-empty">Nie wystawiłeś jeszcze żadnego zaproszenia.</p>
            ) : (
              invitations.map((invitation) => (
                <article key={invitation.id} className="specialist-list-row">
                  <div>
                    <p className="specialist-list-title">{invitation.email}</p>
                    <p className="specialist-list-meta">
                      dla {childName(invitation)} · {STATUS_LABELS[invitation.status]}
                    </p>
                    <p className="specialist-list-meta">
                      {invitation.status === 'used'
                        ? `Konto założone ${linkedSinceLabel(invitation.usedAt) ?? ''}`
                        : `Kod działa do ${linkedSinceLabel(invitation.expiresAt) ?? ''}`}
                    </p>
                  </div>
                  {/* A used invitation is a record of an account that exists —
                      deleting the row would not un-create it, so the backend
                      refuses and the button is not offered. */}
                  {invitation.status !== 'used' && (
                    <button
                      type="button"
                      className="caseload-card-drop"
                      onClick={() => void revoke(invitation)}
                      disabled={busyId === invitation.id}
                    >
                      Anuluj
                    </button>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default SpecialistParentAccounts
