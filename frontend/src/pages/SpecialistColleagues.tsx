import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FormField from '../components/FormField'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import {
  COLLEAGUE_FIELDS,
  createColleague,
  fetchColleagues,
  type Colleague,
  type CreatedColleague,
} from '../api/specialist'
import { toFormErrors } from '../api/auth'
import { useAuth } from '../auth/authContext'
import { usePagination } from '../hooks/usePagination'
import { linkedSinceLabel } from '../utils/children'
import { colleagueLabel } from '../utils/specialist'
import { ROUTES } from '../routes'
import './journals.css'
import '../components/auth.css'
import '../styles/panel.css'
import './specialist.css'

/**
 * "Konta specjalistów" — where a specialist account comes from.
 *
 * WHY IT IS HERE AND NOT IN THE REGISTRATION FORM. A specialist used to sign up
 * from the public form like anybody else. That was safe as far as access goes —
 * being a specialist grants nothing on its own, and `patient.id_specjalist` is
 * not self-assignable — but wrong about the claim the account makes: the app
 * cannot check anybody's qualifications, and an existing specialist can. So the
 * option is gone from registration (`ACCOUNT_TYPES` in core/serializers.py maps
 * no such type, so a hand-made request is a 400 too) and the account is created
 * here instead.
 *
 * THE PASSWORD IS SHOWN ONCE AND THE SCREEN SAYS SO, exactly like a guardian
 * invitation code and for the same reason: this deployment sends no mail at all,
 * so a credential travels as something handed over in the room. It is stored as
 * a hash, so nothing can read it back afterwards — not this screen, not the
 * roster, not the database. There is no password reset here either, which is why
 * the wording is as blunt as it is.
 *
 * THE NEW ACCOUNT GRANTS NO CONSENTS, and the screen says that too. Consent is
 * the act of the person it belongs to (RODO art. 7), so a colleague cannot tick
 * the boxes for them: the account is locked until its owner logs in and grants
 * them on pages/ConsentsRequired.tsx. The roster reports which accounts are
 * still waiting on that, because otherwise "nie mogę się zalogować" has no
 * visible answer.
 *
 * AND IT HAS TO REPLACE THE PASSWORD ABOVE, which is the second thing the new
 * account does before the panel opens (pages/PasswordChangeRequired.tsx). The
 * screen says so where it hands the password over, because it is a fact about
 * the credential the specialist is writing down: they will know it, and it is
 * meant to stop working. `must_change_password` is what enforces it.
 *
 * WHAT THE ROSTER DOES NOT SHOW is any colleague's patients. Those patients
 * agreed to *them*, not to every specialist in the list — see
 * COLLEAGUE_SUMMARY_FIELDS in core/colleagues.py, which is the payload's own
 * argument for holding identity and nothing else.
 *
 * THE ROSTER IS PAGINATED, seven rows a page like every other list in the app
 * (hooks/usePagination.ts). It is the list with the strongest case for it:
 * `/api/specialist/colleagues/` answers with *every* specialist account in the
 * system, it is not filtered to the ones you created, and there is no delete
 * endpoint — so it only ever grows. Creating an account sends the screen back
 * to page one, because the new row is prepended and a specialist reading the
 * password above has to be able to see the account it belongs to.
 */

const LOAD_ERROR = 'Nie udało się wczytać listy kont specjalistów. Spróbuj ponownie.'
const CREATE_ERROR = 'Nie udało się utworzyć konta. Spróbuj ponownie.'

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  dateOfBirth: '',
  specialization: '',
}

// Keeps the native picker from offering a future date at all; the backend still
// checks it, and also refuses a date that makes the person a minor.
const TODAY = new Date().toISOString().slice(0, 10)

function SpecialistColleagues() {
  const { user } = useAuth()
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const pages = usePagination(colleagues)

  const [values, setValues] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The plaintext password, for as long as this screen is open. Deliberately
  // not persisted anywhere — see the header.
  const [created, setCreated] = useState<CreatedColleague | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchColleagues()
      .then((rows) => {
        if (cancelled) return
        setColleagues(rows)
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

  function change(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  const complete = Object.values(values).every((value) => value.trim() !== '')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setFormError(null)
    setCreated(null)
    try {
      const result = await createColleague({
        email: values.email.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        dateOfBirth: values.dateOfBirth,
        specialization: values.specialization.trim(),
      })
      setCreated(result)
      setColleagues((current) => [result.specialist, ...current])
      // The new row goes to the top of the list, which is page one — and the
      // password handed over above is only useful next to the account it opens.
      pages.reset()
      setValues(EMPTY_FORM)
    } catch (cause: unknown) {
      if (cause instanceof ApiError) {
        // Re-keyed so a Django field error lands under the input that produced
        // it, the same way the registration form does it.
        setErrors(toFormErrors(cause.fieldErrors, COLLEAGUE_FIELDS) as Record<string, string>)
        setFormError(
          cause.formMessage ?? (Object.keys(cause.fieldErrors).length ? null : CREATE_ERROR),
        )
      } else {
        setFormError(CREATE_ERROR)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL SPECJALISTY</p>
          <h1>Konta specjalistów</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistHome}>
        ← Wróć do panelu
      </Link>

      <p className="reports-intro">
        Konto specjalisty zakłada inny specjalista — nie da się go utworzyć
        w formularzu rejestracji. Hasło zobaczysz raz i przekazujesz je
        osobiście: aplikacja nie wysyła wiadomości. Osoba, dla której zakładasz
        konto, ustawia własne hasło przy pierwszym logowaniu.
      </p>

      {created && (
        /* The whole point of the screen, so it sits above the form rather than
           below it: a password that has scrolled off is a password that is
           lost, and nothing can read it back. */
        <section className="specialist-code" aria-labelledby="specialist-password-heading">
          <h2 id="specialist-password-heading">Hasło tymczasowe</h2>
          <p className="specialist-code-value">{created.password}</p>
          <p className="specialist-code-note">
            Zapisz je teraz i przekaż{' '}
            <strong>{colleagueLabel(created.specialist)}</strong>. Nie zobaczysz
            go ponownie — jest przechowywane w postaci zaszyfrowanej i nie da się
            go odzyskać ani zmienić za tę osobę.
          </p>
          <p className="specialist-code-note">
            Specjalista loguje się adresem <strong>{created.specialist.email}</strong>{' '}
            i tym hasłem. Przy pierwszym logowaniu udziela zgód RODO — nikt nie może
            zrobić tego za niego — a potem ustawia własne hasło. Do tego czasu panel
            pozostaje zamknięty: to hasło znasz również Ty.
          </p>
        </section>
      )}

      {loading && (
        <div className="panel-loading" role="status" aria-busy="true">
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
          <form className="specialist-form" onSubmit={(event) => void submit(event)} noValidate>
            <FormField
              id="firstName"
              label="Imię"
              type="text"
              autoComplete="off"
              value={values.firstName}
              onChange={change}
              error={errors.firstName}
              disabled={saving}
            />
            <FormField
              id="lastName"
              label="Nazwisko"
              type="text"
              autoComplete="off"
              value={values.lastName}
              onChange={change}
              error={errors.lastName}
              disabled={saving}
            />
            <FormField
              id="email"
              label="Adres e-mail"
              type="email"
              autoComplete="off"
              value={values.email}
              onChange={change}
              error={errors.email}
              disabled={saving}
            />
            <FormField
              id="dateOfBirth"
              label="Data urodzenia"
              type="date"
              autoComplete="off"
              max={TODAY}
              value={values.dateOfBirth}
              onChange={change}
              error={errors.dateOfBirth}
              disabled={saving}
            />
            {/* Required, and not for tidiness: the patient reads it next to the
                name when deciding whether to accept the invitation, and on the
                care card afterwards. */}
            <FormField
              id="specialization"
              label="Specjalizacja"
              type="text"
              autoComplete="off"
              placeholder="np. psychoterapia poznawczo-behawioralna"
              value={values.specialization}
              onChange={change}
              error={errors.specialization}
              disabled={saving}
            />
            {formError && (
              <p className="panel-error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="panel-button" disabled={saving || !complete}>
              {saving ? 'Tworzenie konta…' : 'Utwórz konto specjalisty'}
            </button>
          </form>

          <section className="specialist-list" aria-labelledby="specialist-roster-heading">
            <h2 id="specialist-roster-heading" className="panel-section-heading">
              Konta w systemie
            </h2>
            {colleagues.length === 0 ? (
              /* Only reachable when the roster failed to include the signed-in
                 account — i.e. never in practice. Said plainly rather than
                 drawn as an empty box. */
              <p className="panel-empty">Nie ma jeszcze żadnych kont specjalistów.</p>
            ) : (
              pages.items.map((colleague) => (
                <article key={colleague.id} className="specialist-list-row">
                  <div>
                    <p className="specialist-list-title">
                      {colleagueLabel(colleague)}
                      {colleague.id === user?.id && ' · to Ty'}
                    </p>
                    <p className="specialist-list-meta">{colleague.email}</p>
                    {colleague.specialization && (
                      <p className="specialist-list-meta">{colleague.specialization}</p>
                    )}
                    <p className="specialist-list-meta">
                      {colleague.consentsActive
                        ? `Konto aktywne${
                            linkedSinceLabel(colleague.createdAt)
                              ? ` · utworzone ${linkedSinceLabel(colleague.createdAt)}`
                              : ''
                          }`
                        : 'Czeka na pierwsze logowanie: zgody RODO i własne hasło'}
                    </p>
                  </div>
                </article>
              ))
            )}
            <Pagination
              page={pages.page}
              pageCount={pages.pageCount}
              from={pages.from}
              to={pages.to}
              total={pages.total}
              onChange={pages.goTo}
              unit="kont"
            />
            {/* Says what the list is not, for the same reason the panel's
                "Zakres dostępu" card does: a roster of colleagues invites the
                question of whose patients they are, and the answer is that this
                screen does not know. */}
            <p className="panel-note">
              Lista zawiera tylko dane zawodowe. Nie widzisz tu pacjentów innych
              specjalistów — pacjent zgadza się na konkretną osobę.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

export default SpecialistColleagues
