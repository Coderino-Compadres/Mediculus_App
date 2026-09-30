import type { FormEvent } from 'react'
import FormField from './FormField'
import { EMAIL_CHANGE_FIELDS, requestEmailChange } from '../api/account'
import { useAuthForm } from '../hooks/useAuthForm'
import { validateEmail } from '../utils/validation'
// `.auth-form` and friends. This form is rendered on both modules' profiles
// and has to look the same on each — it is the same form for the same
// account — so it carries its own stylesheet instead of relying on the
// screen to know about it.
import './auth.css'

/**
 * "Zmień adres e-mail" — the first of two halves.
 *
 * NOTHING CHANGES WHEN THIS FORM IS SAVED. It sends the new address and the
 * current password; the server checks the password and mails a link **to the
 * new address**, and the address changes only when that link is confirmed on
 * pages/EmailChangeConfirm.tsx. See core/email_change.py for why: the address is
 * how the account is recovered, so a typo written straight to it would lock the
 * owner out of their own password reset.
 *
 * The success notice is worded accordingly — "check your inbox", never "zmieniono".
 */
export const SENT = (address: string) =>
  `Wysłaliśmy link na adres ${address}. Otwórz go w ciągu godziny i potwierdź zmianę — ` +
  'do tego czasu logujesz się dotychczasowym adresem.'

function ProfileEmailForm({ currentEmail }: { currentEmail: string | null }) {
  const { values, errors, formError, status, submitting, handleChange, handleSubmit } = useAuthForm({
    newEmail: '',
    emailPassword: '',
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        newEmail: validateEmail(currentValues.newEmail),
        // The account's existing password — present is all that is asked here;
        // the server decides whether it is right.
        emailPassword: currentValues.emailPassword ? null : 'Podaj hasło.',
      }),
      submit: (currentValues) =>
        requestEmailChange({
          newEmail: currentValues.newEmail,
          currentPassword: currentValues.emailPassword,
        }),
      fields: EMAIL_CHANGE_FIELDS,
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
          {SENT(values.newEmail.trim())}
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

      <FormField
        id="emailPassword"
        label="Obecne hasło"
        type="password"
        autoComplete="current-password"
        value={values.emailPassword}
        onChange={handleChange}
        error={errors.emailPassword}
        disabled={submitting}
      />

      <button type="submit" className="auth-submit" disabled={submitting}>
        {submitting ? 'Wysyłanie…' : 'Wyślij link na nowy adres'}
      </button>
    </form>
  )
}

export default ProfileEmailForm
