import { useState } from 'react'
import { Link } from 'react-router-dom'
import FormField from '../components/FormField'
import mediculusLogo from '../assets/mediculus-logo.jpeg'
import { validateEmail, validatePassword } from '../utils/validation'
import './auth.css'

function Login() {
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')

  function handleChange(event) {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    const nextErrors = {
      email: validateEmail(values.email),
      password: validatePassword(values.password),
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
        <h1>Witaj ponownie</h1>
        <p className="auth-subtitle">Zaloguj się, aby wrócić do swojego dzienniczka.</p>

        {status === 'success' && (
          <p className="auth-success">Dane poprawne — logowanie zostanie podłączone do backendu wkrótce.</p>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
            autoComplete="current-password"
            value={values.password}
            onChange={handleChange}
            error={errors.password}
          />

          <button type="submit" className="auth-submit">
            Zaloguj się
          </button>
        </form>

        <p className="auth-switch">
          Nie masz konta? <Link to="/register">Zarejestruj się</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
