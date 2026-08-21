import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import ConsentField from '../components/ConsentField'
import SelectField, { type SelectOption } from '../components/SelectField'
import { useAuthForm } from '../hooks/useAuthForm'
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
} from '../utils/validation'

const INITIAL_VALUES = {
  accountType: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  email: '',
  password: '',
  confirmPassword: '',
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
]

const INITIAL_CONSENTS = {
  dataConsent: false,
  servicesConsent: false,
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
    const { name, checked } = event.target as { name: keyof typeof INITIAL_CONSENTS; checked: boolean }
    setConsents((prev) => ({ ...prev, [name]: checked }))
    setStatus('idle')
    setFormError(null)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        accountType: validateAccountType(currentValues.accountType),
        firstName: validateName(currentValues.firstName, 'imię'),
        lastName: validateName(currentValues.lastName, 'nazwisko'),
        dateOfBirth: validateDateOfBirth(currentValues.dateOfBirth),
        email: validateEmail(currentValues.email),
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
      }),
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
          <ConsentField
            id="dataConsent"
            label="Wyrażam zgodę na przetwarzanie moich danych osobowych, w tym danych o zdrowiu, w aplikacji Mediculus zgodnie z RODO (art. 9)."
            checked={consents.dataConsent}
            onChange={handleConsentChange}
            error={errors.dataConsent}
          />
          <ConsentField
            id="servicesConsent"
            label="Wyrażam zgodę na korzystanie z usług Fundacji Mediculus oraz akceptuję regulamin świadczenia usług."
            checked={consents.servicesConsent}
            onChange={handleConsentChange}
            error={errors.servicesConsent}
          />
        </div>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Tworzenie konta…' : 'Załóż konto'}
        </button>
      </form>
    </AuthLayout>
  )
}

export default Register
