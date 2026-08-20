import { useState } from 'react'
import { Link } from 'react-router-dom'
import FormField from '../components/FormField'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import {
  validateEmail,
  validatePassword,
  validateName,
  validateConfirmPassword,
  validateConsent,
} from '../utils/validation'
import './auth.css'

const INITIAL_VALUES = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
}

function Register() {
  const [values, setValues] = useState(INITIAL_VALUES)
  const [dataConsent, setDataConsent] = useState(false)
  const [servicesConsent, setServicesConsent] = useState(false)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')

  function handleChange(event) {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  function handleDataConsentChange(event) {
    setDataConsent(event.target.checked)
  }

  function handleServicesConsentChange(event) {
    setServicesConsent(event.target.checked)
  }

  function validate() {
    const nextErrors = {
      firstName: validateName(values.firstName, 'imię'),
      lastName: validateName(values.lastName, 'nazwisko'),
      email: validateEmail(values.email),
      password: validatePassword(values.password),
      confirmPassword: validateConfirmPassword(values.confirmPassword, values.password),
      dataConsent: validateConsent(
        dataConsent,
        'Zgoda na przetwarzanie danych jest wymagana, aby założyć konto.',
      ),
      servicesConsent: validateConsent(
        servicesConsent,
        'Zgoda na usługi fundacji jest wymagana, aby założyć konto.',
      ),
    }
    setErrors(nextErrors)
    return Object.values(nextErrors).every((error) => !error)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) {
      setStatus('idle')
      return
    }
    setStatus('success')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src={mediculusLogo} alt="Fundacja Mediculus" />
        <h1>Utwórz konto</h1>
        <p className="auth-subtitle">Kilka danych i możemy zaczynać.</p>

        {status === 'success' && (
          <p className="auth-success">Dane poprawne — rejestracja zostanie podłączona do backendu wkrótce.</p>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
            <div className="auth-consent-item">
              <div className="auth-consent">
                <input
                  id="dataConsent"
                  name="dataConsent"
                  type="checkbox"
                  checked={dataConsent}
                  onChange={handleDataConsentChange}
                  aria-invalid={Boolean(errors.dataConsent)}
                  aria-describedby={errors.dataConsent ? 'dataConsent-error' : undefined}
                />
                <label htmlFor="dataConsent">
                  Wyrażam zgodę na przetwarzanie moich danych osobowych, w tym danych o zdrowiu, w
                  aplikacji Mediculus zgodnie z RODO (art. 9).
                </label>
              </div>
              {errors.dataConsent && (
                <span id="dataConsent-error" className="auth-field-error">
                  {errors.dataConsent}
                </span>
              )}
            </div>

            <div className="auth-consent-item">
              <div className="auth-consent">
                <input
                  id="servicesConsent"
                  name="servicesConsent"
                  type="checkbox"
                  checked={servicesConsent}
                  onChange={handleServicesConsentChange}
                  aria-invalid={Boolean(errors.servicesConsent)}
                  aria-describedby={errors.servicesConsent ? 'servicesConsent-error' : undefined}
                />
                <label htmlFor="servicesConsent">
                  Wyrażam zgodę na korzystanie z usług Fundacji Mediculus oraz akceptuję regulamin
                  świadczenia usług.
                </label>
              </div>
              {errors.servicesConsent && (
                <span id="servicesConsent-error" className="auth-field-error">
                  {errors.servicesConsent}
                </span>
              )}
            </div>
          </div>

          <button type="submit" className="auth-submit">
            Załóż konto
          </button>
        </form>

        <p className="auth-switch">
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </p>
      </div>
    </div>
  )
}

export default Register
