import { type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { useAuthForm } from '../hooks/useAuthForm'
import { useAuth } from '../auth/authContext'
import { PASSWORD_RESET_CONFIRM_FIELDS, confirmPasswordReset } from '../api/auth'
import { ROUTES } from '../routes'
import { validateConfirmPassword, validatePassword } from '../utils/validation'

/**
 * Where the mailed link lands: set a new password, then log in with it.
 *
 * THE TOKEN COMES OUT OF THE URL AND IS NEVER SHOWN. It is the whole credential
 * for the next hour, so it is not rendered, not put in an input the browser
 * could offer to save, and not echoed in any message — the only thing this
 * screen does with it is post it.
 *
 * NOTHING IS PRE-VALIDATED. The screen does not ask the backend whether the
 * token is good before drawing the form, and that is deliberate: an endpoint
 * answering "is this token real" is an endpoint for testing tokens. A dead link
 * is found out on submit, in one refusal that does not say *which* way it is
 * dead (expired, already used, forged) — see `PasswordResetConfirmSerializer`.
 * The cost is a person typing a password before learning the link expired, and
 * the message tells them exactly what to do about it.
 *
 * NO SESSION IS STARTED. The backend answers 204 and closes every session the
 * account had, including any this browser holds — which is the point of a reset
 * — so the screen clears the local session too and sends the user to /login.
 * Logging them straight in would make an e-mailed token as good as the password
 * it just replaced.
 */

export const SUCCESS =
  'Hasło zostało ustawione. Zaloguj się nowym hasłem — na pozostałych urządzeniach ' +
  'sesje zostały zamknięte.'

export const MISSING_TOKEN =
  'Ten adres nie zawiera linku do ustawienia hasła. Otwórz link z wiadomości e-mail ' +
  'lub poproś o nowy.'

function PasswordResetConfirm() {
  const { token } = useParams<{ token: string }>()
  const { setUser } = useAuth()
  const { values, errors, status, formError, submitting, handleChange, handleSubmit } =
    useAuthForm({ password: '', confirmPassword: '' })

  const done = status === 'success'

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        password: validatePassword(currentValues.password),
        confirmPassword: validateConfirmPassword(
          currentValues.confirmPassword,
          currentValues.password,
        ),
      }),
      submit: async (currentValues) => {
        await confirmPasswordReset({
          token: token ?? '',
          password: currentValues.password,
          confirmPassword: currentValues.confirmPassword,
        })
        // The server has already dropped this browser's session, if it had one.
        // Clearing it here is what stops the route guard from believing in a
        // user that no longer has anything to authenticate with.
        setUser(null)
      },
      fields: PASSWORD_RESET_CONFIRM_FIELDS,
    })
  }

  return (
    <AuthLayout
      title="Ustaw nowe hasło"
      subtitle="Wybierz hasło, którego nie używasz nigdzie indziej."
      successMessage={done ? SUCCESS : null}
      footer={
        <p className="auth-switch">
          {done ? (
            <Link to={ROUTES.login}>Przejdź do logowania</Link>
          ) : (
            <>
              Link nie działa? <Link to={ROUTES.passwordReset}>Poproś o nowy</Link>
            </>
          )}
        </p>
      }
    >
      {!token ? (
        <p className="auth-submit-error" role="alert">
          {MISSING_TOKEN}
        </p>
      ) : (
        !done && (
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {formError && (
              <p className="auth-submit-error" role="alert">
                {formError}
              </p>
            )}

            <FormField
              id="password"
              label="Nowe hasło"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={handleChange}
              error={errors.password}
              disabled={submitting}
            />
            <FormField
              id="confirmPassword"
              label="Powtórz nowe hasło"
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={handleChange}
              error={errors.confirmPassword}
              disabled={submitting}
            />

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Zapisywanie…' : 'Ustaw hasło'}
            </button>
          </form>
        )
      )}
    </AuthLayout>
  )
}

export default PasswordResetConfirm
