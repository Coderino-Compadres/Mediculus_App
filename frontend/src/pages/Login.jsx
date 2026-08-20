import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { useAuthForm } from '../hooks/useAuthForm'
import { validateEmail, validatePassword } from '../utils/validation'

function Login() {
  const { values, errors, status, handleChange, handleSubmit } = useAuthForm({
    email: '',
    password: '',
  })

  function onSubmit(event) {
    handleSubmit(event, (currentValues) => ({
      email: validateEmail(currentValues.email),
      password: validatePassword(currentValues.password),
    }))
  }

  return (
    <AuthLayout
      title="Witaj ponownie"
      subtitle="Zaloguj się, aby wrócić do swojego dzienniczka."
      successMessage={
        status === 'success'
          ? 'Dane poprawne — logowanie zostanie podłączone do backendu wkrótce.'
          : null
      }
      footer={
        <p className="auth-switch">
          Nie masz konta? <Link to="/register">Zarejestruj się</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
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
    </AuthLayout>
  )
}

export default Login
