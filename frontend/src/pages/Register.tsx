import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import ConsentField from '../components/ConsentField'
import { useAuthForm } from '../hooks/useAuthForm'
import {
  validateEmail,
  validatePassword,
  validateName,
  validateConfirmPassword,
  validateConsent,
} from '../utils/validation'

const INITIAL_VALUES = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
}

const INITIAL_CONSENTS = {
  dataConsent: false,
  servicesConsent: false,
}

function Register() {
  const { values, errors, status, handleChange, handleSubmit, setStatus } =
    useAuthForm(INITIAL_VALUES)
  const [consents, setConsents] = useState(INITIAL_CONSENTS)

  function handleConsentChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, checked } = event.target as { name: keyof typeof INITIAL_CONSENTS; checked: boolean }
    setConsents((prev) => ({ ...prev, [name]: checked }))
    setStatus('idle')
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    handleSubmit(event, (currentValues) => ({
      firstName: validateName(currentValues.firstName, 'imię'),
      lastName: validateName(currentValues.lastName, 'nazwisko'),
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
    }))
  }

  return (
    <AuthLayout
      title="Utwórz konto"
      subtitle="Kilka danych i możemy zaczynać."
      successMessage={
        status === 'success'
          ? 'Dane poprawne — rejestracja zostanie podłączona do backendu wkrótce.'
          : null
      }
      footer={
        <p className="auth-switch">
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <FormField
          id="firstName"
          label="Imię"
          type="text"
          autoComplete="given-name"
          value={values.firstName}
          onChange={handleChange}
          error={errors.firstName}
        />
        <FormField
          id="lastName"
          label="Nazwisko"
          type="text"
          autoComplete="family-name"
          value={values.lastName}
          onChange={handleChange}
          error={errors.lastName}
        />
        <FormField
          id="email"
          label="Adres e-mail"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
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
        />
        <FormField
          id="confirmPassword"
          label="Powtórz hasło"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
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

        <button type="submit" className="auth-submit">
          Załóż konto
        </button>
      </form>
    </AuthLayout>
  )
}

export default Register
