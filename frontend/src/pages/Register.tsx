import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import ConsentField from '../components/ConsentField'
import SelectField, { type SelectOption } from '../components/SelectField'
import { useAuthForm, FORM_ERROR } from '../hooks/useAuthForm'
import { CONSENTS, CONSENT_IDS, type ConsentId } from '../utils/consents'
import { useAuth } from '../auth/authContext'
import { ACCOUNT_TYPES, REGISTER_FIELDS, register } from '../api/auth'
import {
  validateEmail,
  validatePassword,
  validateName,
  validateConfirmPassword,
  validateConsent,
  validateDateOfBirth,
  validateAccountType,
  ageFromDateOfBirth,
  ADULT_AGE,
} from '../utils/validation'

const INITIAL_VALUES = {
  accountType: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  email: '',
  password: '',
  confirmPassword: '',
  // Both only apply to one account type, and both are sent only when filled —
  // see `register` in api/auth.ts.
  specialization: '',
  invitationCode: '',
}

// A guardian's account is not a patient account: it gets no diary of its own,
// which is why this choice cannot be inferred from the date of birth.
// Keeps the native picker from offering a future date at all; the client-side
// check and the backend both still verify it.
const TODAY = new Date().toISOString().slice(0, 10)

const ACCOUNT_TYPE_OPTIONS: SelectOption[] = [
  { value: ACCOUNT_TYPES.patient, label: 'Konto pacjenta' },
  { value: ACCOUNT_TYPES.minorPatient, label: 'Konto pacjenta małoletniego' },
  { value: ACCOUNT_TYPES.parent, label: 'Konto rodzica lub opiekuna' },
  // A specialist registers here like everybody else, and that is safe because of
  // what the role does *not* grant: every patient-facing endpoint refuses them,
  // and the reports they may read are the reports of patients who accepted their
  // invitation. `patient.id_specjalist` is not self-assignable — see the note on
  // ACCOUNT_TYPES in core/serializers.py.
  { value: ACCOUNT_TYPES.specialist, label: 'Konto specjalisty' },
]

// Keyed by ConsentId, so the boxes and the wording below cannot drift apart:
// utils/consents.ts is the one place either is declared.
const INITIAL_CONSENTS: Record<ConsentId, boolean> = {
  [CONSENT_IDS.data]: false,
  [CONSENT_IDS.services]: false,
}

/**
 * The declared account type has to agree with the date of birth.
 *
 * Mirrors `_check_age_matches_account_type` in core/serializers.py — the backend
 * is the one that decides, this is just so the user does not wait for a
 * round-trip to be told. A guardian is deliberately not age-checked here either.
 */
function accountTypeConflict(accountType: string, dateOfBirth: string): string | null {
  const age = ageFromDateOfBirth(dateOfBirth)
  if (age === null) return null

  if (accountType === ACCOUNT_TYPES.patient && age < ADULT_AGE) {
    return 'Podana data urodzenia oznacza osobę niepełnoletnią. Wybierz „konto pacjenta małoletniego” albo popraw datę urodzenia.'
  }
  if (accountType === ACCOUNT_TYPES.minorPatient && age >= ADULT_AGE) {
    return 'Podana data urodzenia oznacza osobę pełnoletnią. Wybierz „konto pacjenta” albo popraw datę urodzenia.'
  }
  return null
}

/**
 * The specialist's own required field, checked here so the answer does not need
 * a round-trip. Mirrors `_check_specialist_fields` in core/serializers.py, which
 * is what actually decides.
 *
 * Why it is required at all: the patient reads it next to the specialist's name
 * when deciding whether to accept them, and on the care card afterwards. An
 * account without it asks somebody to agree to be treated by a person with no
 * stated role.
 */
function validateSpecialization(accountType: string, value: string): string | null {
  if (accountType !== ACCOUNT_TYPES.specialist) return null
  return value.trim()
    ? null
    : 'Podaj swoją specjalizację — pacjent widzi ją przy Twoim nazwisku.'
}

function Register() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const {
    values,
    errors,
    formError,
    submitting,
    handleChange,
    handleSubmit,
    setStatus,
    setFormError,
  } = useAuthForm(INITIAL_VALUES)
  const [consents, setConsents] = useState(INITIAL_CONSENTS)

  function handleConsentChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, checked } = event.target as { name: ConsentId; checked: boolean }
    setConsents((prev) => ({ ...prev, [name]: checked }))
    setStatus('idle')
    setFormError(null)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => {
        const accountType = validateAccountType(currentValues.accountType)
        const dateOfBirth = validateDateOfBirth(currentValues.dateOfBirth)

        return {
          accountType,
          firstName: validateName(currentValues.firstName, 'imię'),
          lastName: validateName(currentValues.lastName, 'nazwisko'),
          dateOfBirth,
          email: validateEmail(currentValues.email),
          specialization: validateSpecialization(
            currentValues.accountType, currentValues.specialization,
          ),
          password: validatePassword(currentValues.password),
          confirmPassword: validateConfirmPassword(currentValues.confirmPassword, currentValues.password),
          dataConsent: validateConsent(
            consents.dataConsent,
            'Zgoda na przetwarzanie danych jest wymagana, aby założyć konto.',
          ),
          servicesConsent: validateConsent(
            consents.servicesConsent,
            'Zgoda na usługi fundacji jest wymagana, aby założyć konto.',
          ),
          // Only worth asking once both halves are individually valid —
          // otherwise it would contradict the field errors above it.
          [FORM_ERROR]:
            accountType || dateOfBirth
              ? null
              : accountTypeConflict(currentValues.accountType, currentValues.dateOfBirth),
        }
      },
      submit: async (currentValues) => {
        // The backend logs the new account in as part of registering it, so
        // there is no second trip through /login here.
        const user = await register({ ...currentValues, ...consents })
        setUser(user)
        navigate('/', { replace: true })
      },
      fields: REGISTER_FIELDS,
    })
  }

  return (
    <AuthLayout
      title="Utwórz konto"
      subtitle="Kilka danych i możemy zaczynać."
      footer={
        <p className="auth-switch">
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="auth-submit-error" role="alert">
            {formError}
          </p>
        )}

        <SelectField
          id="accountType"
          label="Rodzaj konta"
          options={ACCOUNT_TYPE_OPTIONS}
          placeholder="Wybierz…"
          value={values.accountType}
          onChange={handleChange}
          error={errors.accountType}
          disabled={submitting}
        />
        {/* Only for the account type that needs it. Rendered conditionally rather
            than always: an empty "specjalizacja" on a patient's registration form
            is a question they cannot answer, and a stray value would be silently
            ignored by the backend. */}
        {values.accountType === ACCOUNT_TYPES.specialist && (
          <FormField
            id="specialization"
            label="Specjalizacja"
            type="text"
            autoComplete="off"
            placeholder="np. psychoterapia poznawczo-behawioralna"
            value={values.specialization}
            onChange={handleChange}
            error={errors.specialization}
            disabled={submitting}
          />
        )}
        <FormField
          id="firstName"
          label="Imię"
          type="text"
          autoComplete="given-name"
          value={values.firstName}
          onChange={handleChange}
          error={errors.firstName}
          disabled={submitting}
        />
        <FormField
          id="lastName"
          label="Nazwisko"
          type="text"
          autoComplete="family-name"
          value={values.lastName}
          onChange={handleChange}
          error={errors.lastName}
          disabled={submitting}
        />
        <FormField
          id="dateOfBirth"
          label="Data urodzenia"
          type="date"
          autoComplete="bday"
          max={TODAY}
          value={values.dateOfBirth}
          onChange={handleChange}
          error={errors.dateOfBirth}
          disabled={submitting}
        />
        <FormField
          id="email"
          label="Adres e-mail"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          disabled={submitting}
        />
        {/* The code a specialist hands a parent (core/parent_invitations.py).
            Optional — a guardian can register without one and be named by the
            child afterwards — but never silently ignored: a code that does not
            match refuses the registration rather than creating an unlinked
            account that looks like it worked. */}
        {values.accountType === ACCOUNT_TYPES.parent && (
          <FormField
            id="invitationCode"
            label="Kod od specjalisty (jeśli masz)"
            type="text"
            autoComplete="off"
            placeholder="np. ABCD-EFGH-JKMN"
            value={values.invitationCode}
            onChange={handleChange}
            error={errors.invitationCode}
            disabled={submitting}
          />
        )}
        <FormField
          id="password"
          label="Hasło"
          type="password"
          autoComplete="new-password"
          placeholder="min. 8 znaków"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          disabled={submitting}
        />
        <FormField
          id="confirmPassword"
          label="Powtórz hasło"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          disabled={submitting}
        />

        <div className="auth-consents">
          {CONSENTS.map((consent) => (
            <ConsentField
              key={consent.id}
              id={consent.id}
              label={consent.label}
              checked={consents[consent.id]}
              onChange={handleConsentChange}
              error={errors[consent.id]}
            />
          ))}
        </div>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Tworzenie konta…' : 'Załóż konto'}
        </button>
      </form>
    </AuthLayout>
  )
}

export default Register
