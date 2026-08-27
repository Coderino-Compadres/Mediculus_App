import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { useAuthForm } from '../hooks/useAuthForm'
import { useAuth } from '../auth/authContext'
import { LOGIN_FIELDS, login } from '../api/auth'
import { validateEmail, validatePassword } from '../utils/validation'

const INFO_TILE_ID = 'login-info-tile'

function Login() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [infoOpen, setInfoOpen] = useState(false)
  const { values, errors, formError, submitting, handleChange, handleSubmit } = useAuthForm({
    email: '',
    password: '',
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        email: validateEmail(currentValues.email),
        password: validatePassword(currentValues.password),
      }),
      submit: async (currentValues) => {
        const user = await login(currentValues)
        setUser(user)
        navigate('/', { replace: true })
      },
      fields: LOGIN_FIELDS,
    })
  }

  return (
    <AuthLayout
      title="Witaj ponownie"
      subtitle="Zaloguj się, aby wrócić do swojego dzienniczka."
      corner={
        // Escape closes it here rather than on the document: the tile is only
        // reachable from the button, so the two share one focus scope.
        <div
          className="auth-info"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setInfoOpen(false)
          }}
        >
          <button
            type="button"
            className="auth-info-button"
            aria-label="Informacje"
            aria-expanded={infoOpen}
            aria-controls={INFO_TILE_ID}
            onClick={() => setInfoOpen((open) => !open)}
          >
            i
          </button>
          {infoOpen && (
            <p className="auth-info-tile" id={INFO_TILE_ID} role="note">
              Numer konta dla darowizn: 111111111111111111111111
            </p>
          )}
        </div>
      }
      footer={
        <p className="auth-switch">
          Nie masz konta? <Link to="/register">Zarejestruj się</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="auth-submit-error" role="alert">
            {formError}
          </p>
        )}

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
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          disabled={submitting}
        />

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Logowanie…' : 'Zaloguj się'}
        </button>
      </form>
    </AuthLayout>
  )
}

export default Login
