import type { FormEvent } from 'react'
import FormField from './FormField'
import { useAuthForm } from '../hooks/useAuthForm'
import { validateEmail } from '../utils/validation'

/**
 * "Zmień adres e-mail".
 *
 * TODO(backend): nothing is sent. There is no endpoint for this yet; when there
 * is, the `submit` below becomes the call and the notice below becomes its
 * result. The address is validated with the same `validateEmail` the
 * registration form uses, so the two screens cannot disagree about what a
 * valid address is.
 *
 * TODO: a form is not the whole feature. In production, changing the address has
 * to be confirmed by a link sent **to the new address** — otherwise a typo locks
 * the account out of its own password reset, and somebody at a borrowed phone can
 * move the account to an address they control. The mockup shows only the state
 * after saving, so it does not show that half at all: the notice below is worded
 * as "we will confirm it", not "it is changed", to keep the screen honest about
 * which half exists.
 */
function ProfileEmailForm({ currentEmail }: { currentEmail: string | null }) {
  const { values, errors, formError, status, submitting, handleChange, handleSubmit } = useAuthForm({
    newEmail: '',
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        newEmail: validateEmail(currentValues.newEmail),
      }),
      // Resolves without doing anything, which is what makes the message below
      // appear. It says what will happen, not that it has happened.
      submit: async () => {},
    })
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {currentEmail && <p className="auth-hint">Obecny adres: {currentEmail}</p>}

      {formError && (
        <p className="auth-submit-error" role="alert">
          {formError}
        </p>
      )}

      {status === 'success' && (
        <p className="auth-success" role="status">
          Adres wygląda poprawnie. Zmiana zostanie zapisana po podłączeniu backendu — potwierdzimy ją
          wtedy linkiem wysłanym na nowy adres.
        </p>
      )}

      <FormField
        id="newEmail"
        label="Nowy adres e-mail"
        type="email"
        autoComplete="email"
        placeholder="nowy@example.com"
        value={values.newEmail}
        onChange={handleChange}
        error={errors.newEmail}
        disabled={submitting}
      />

      <button type="submit" className="auth-submit" disabled={submitting}>
        Zapisz nowy e-mail
      </button>
    </form>
  )
}

export default ProfileEmailForm
