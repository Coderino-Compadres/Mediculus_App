import { type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { useAuthForm } from '../hooks/useAuthForm'
import { PASSWORD_RESET_FIELDS, requestPasswordReset } from '../api/auth'
import { ROUTES } from '../routes'
import { validateEmail } from '../utils/validation'

/**
 * "Nie pamiętam hasła" — one input, and an answer that is the same either way.
 *
 * THE CONFIRMATION DOES NOT SAY THE ACCOUNT EXISTS, and that is the whole
 * screen. "Wysłaliśmy wiadomość" would be a sentence only a real account could
 * produce, which turns this form into a way to ask whether a given person has
 * an account with a mental-health service — the question `LoginSerializer`'s
 * shared refusal and the specialist invitation forms are all built not to
 * answer. So the message is conditional ("jeśli konto istnieje…"), it is shown
 * for every address the form accepts, and the backend answers 204 to both cases
 * so the browser could not tell them apart even if this screen wanted to.
 *
 * A malformed address is still an error under the input: that is a statement
 * about what was typed, not about who exists.
 *
 * WHAT COMES BACK IS A LINK, NOT A PASSWORD. Nothing is changed by asking — the
 * old password keeps working until somebody opens the link and sets a new one,
 * which is what makes an unsolicited message harmless to the person receiving
 * it.
 */

export const CONFIRMATION =
  'Jeśli konto na tym adresie istnieje, wysłaliśmy na nie wiadomość z linkiem do ' +
  'ustawienia nowego hasła. Link jest ważny przez godzinę. Sprawdź też folder ze spamem.'

function PasswordReset() {
  const { values, errors, status, formError, submitting, handleChange, handleSubmit } =
    useAuthForm({ email: '' })

  const sent = status === 'success'

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({ email: validateEmail(currentValues.email) }),
      submit: async (currentValues) => {
        await requestPasswordReset({ email: currentValues.email })
      },
      fields: PASSWORD_RESET_FIELDS,
    })
  }

  return (
    <AuthLayout
      title="Nie pamiętam hasła"
      subtitle="Podaj adres e-mail konta — wyślemy na niego link do ustawienia nowego hasła."
      successMessage={sent ? CONFIRMATION : null}
      footer={
        <p className="auth-switch">
          Pamiętasz hasło? <Link to={ROUTES.login}>Wróć do logowania</Link>
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

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Wysyłanie…' : 'Wyślij link'}
        </button>
      </form>
    </AuthLayout>
  )
}

export default PasswordReset
