import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { useAuthForm } from '../hooks/useAuthForm'
import { useAuth } from '../auth/authContext'
import { GUARDIAN_FIELDS, linkGuardian } from '../api/auth'
import { ROUTES } from '../routes'
import { validateEmail } from '../utils/validation'

/**
 * The one screen a minor's account can reach before it is linked to a guardian.
 *
 * Consent to process health data ticked by a minor alone is not valid consent
 * (RODO art. 8), so the account stays unusable until an adult's account vouches
 * for it — hence a full screen rather than a banner, and hence the sign-out in
 * the footer: it is the only other thing to do from here.
 *
 * The guardian must already have their own account. Naming an address that has
 * none is answered as a field error, not as an invitation: sending mail is
 * something the backend cannot do yet.
 */
function LinkGuardian() {
  const { user, setUser, signOut } = useAuth()
  const navigate = useNavigate()
  const { values, errors, formError, submitting, handleChange, handleSubmit } = useAuthForm({
    guardianEmail: '',
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        guardianEmail:
          validateEmail(currentValues.guardianEmail) ??
          ownAddress(currentValues.guardianEmail, user?.email),
      }),
      submit: async (currentValues) => {
        // The backend answers with the updated user, so the route guard sees a
        // linked account without a second trip through /api/auth/me/.
        setUser(await linkGuardian(currentValues))
        navigate(ROUTES.modules, { replace: true })
      },
      fields: GUARDIAN_FIELDS,
    })
  }

  return (
    <AuthLayout
      title="Powiąż konto z opiekunem"
      subtitle="Konto osoby małoletniej działa dopiero wtedy, gdy jest powiązane z kontem rodzica lub opiekuna."
      footer={
        <p className="auth-switch">
          To nie Twoje konto?{' '}
          <button type="button" className="auth-link-button" onClick={() => void signOut()}>
            Wyloguj się
          </button>
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
          id="guardianEmail"
          label="Adres e-mail rodzica lub opiekuna"
          type="email"
          autoComplete="email"
          value={values.guardianEmail}
          onChange={handleChange}
          error={errors.guardianEmail}
          disabled={submitting}
        />
        <p className="auth-hint">
          Rodzic lub opiekun musi mieć już własne konto w Mediculusie. Jeśli go nie ma, poproś
          o rejestrację i wróć tutaj z tym samym adresem.
        </p>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Wiązanie…' : 'Powiąż konto'}
        </button>
      </form>
    </AuthLayout>
  )
}

/**
 * Mirrors the `parent_child_not_self` check constraint, so the answer names the
 * mistake instead of arriving as a database error.
 */
function ownAddress(value: string, ownEmail: string | null | undefined): string | null {
  if (!ownEmail) return null
  if (value.trim().toLowerCase() !== ownEmail.toLowerCase()) return null
  return 'To Twój własny adres. Podaj adres konta rodzica lub opiekuna.'
}

export default LinkGuardian
