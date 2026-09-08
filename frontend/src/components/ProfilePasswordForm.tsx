import type { FormEvent } from 'react'
import FormField from './FormField'
import { PASSWORD_FIELDS, changePassword } from '../api/account'
import { useAuthForm, FORM_ERROR } from '../hooks/useAuthForm'
import { validateConfirmPassword, validatePassword } from '../utils/validation'

/** Present, nothing more — see the note above on why this is not `validatePassword`. */
function validateCurrentPassword(value: string): string | null {
  return value ? null : 'Podaj obecne hasło.'
}

/**
 * "Zmień hasło" — current password, new password, new password again.
 *
 * The new password and its repeat go through the registration form's own checks
 * (`validatePassword`, `validateConfirmPassword`), so "min. 8 znaków" means the
 * same thing on both screens.
 *
 * The **current** password only has to be present. It used to go through
 * `validatePassword` too, on the reasoning that it was set under the same rule so
 * it satisfies it — which is not true of every row: accounts seeded by
 * `mock_data.sql`, or created before the rule, can hold a shorter one. Those
 * accounts were shown "Hasło musi mieć co najmniej 8 znaków." under "Obecne
 * hasło" and could never submit the form, a dead end with no action available to
 * them. Whether the current password is right is the server's judgement anyway;
 * this field only has to be filled in.
 *
 * The form posts to `POST /api/account/password/`, which does the two things
 * this screen cannot: it verifies the current password (the field below proves
 * nothing on its own — it is here so the user is not sent to a separate
 * re-authentication screen) and it runs the new one through Django's validators,
 * which reject things these checks accept, such as a common password of twelve
 * characters or one that resembles the account's own e-mail. Those verdicts land
 * on the right input by themselves: `useAuthForm` places server field errors,
 * and `PASSWORD_FIELDS` is the name mapping that gets them there.
 *
 * The session survives on purpose — see `PasswordChangeSerializer.save`.
 *
 * ONE FORM, TWO SCREENS. "Profil" renders it as an ordinary setting; the screen
 * an account created by a colleague is held on (pages/PasswordChangeRequired.tsx)
 * renders the same component, because a second copy would be a second set of
 * rules about what a password may be. The props below are the whole difference
 * between the two, and each exists because the held screen has to do something
 * this one does not: hand the updated account to the session so the route guard
 * moves the app, and word the button for somebody who is not "changing" a
 * password so much as receiving one.
 */
interface ProfilePasswordFormProps {
  /**
   * Run after the password has actually been changed, before the form reports
   * success.
   *
   * Awaited on purpose: on the held screen this re-reads /api/auth/me/ and hands
   * the result to the session, and if it were fired and forgotten the form would
   * flash "zapisano" on a screen the guard is about to unmount. A failure inside
   * it surfaces as a form error — which is honest, because from the user's side
   * "the password changed but the app did not let me in" is a failure even
   * though the write succeeded.
   */
  onChanged?: () => Promise<void>
  submitLabel?: string
  successMessage?: string
  /** What the first input is called. On the held screen the "current" password
   *  is one the account was given rather than one it set, and calling it
   *  "obecne" there would describe it as a choice somebody made. */
  currentPasswordLabel?: string
}

function ProfilePasswordForm({
  onChanged,
  submitLabel = 'Zapisz nowe hasło',
  successMessage = 'Hasło zostało zmienione. Następnym razem zaloguj się nowym hasłem.',
  currentPasswordLabel = 'Obecne hasło',
}: ProfilePasswordFormProps = {}) {
  const { values, errors, formError, status, submitting, handleChange, handleSubmit } = useAuthForm({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => {
        const newPassword = validatePassword(currentValues.newPassword)
        return {
          currentPassword: validateCurrentPassword(currentValues.currentPassword),
          newPassword,
          confirmNewPassword: validateConfirmPassword(
            currentValues.confirmNewPassword,
            currentValues.newPassword,
          ),
          // Above the form rather than under one input: blaming either field for
          // them being equal would be arbitrary. Only asked once the new password
          // is valid on its own, or it would contradict the error under it.
          [FORM_ERROR]:
            !newPassword && currentValues.newPassword === currentValues.currentPassword
              ? 'Nowe hasło musi różnić się od obecnego.'
              : null,
        }
      },
      submit: async (currentValues) => {
        await changePassword(currentValues)
        await onChanged?.()
      },
      fields: PASSWORD_FIELDS,
    })
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {formError && (
        <p className="auth-submit-error" role="alert">
          {formError}
        </p>
      )}

      {status === 'success' && (
        <p className="auth-success" role="status">
          {successMessage}
        </p>
      )}

      <FormField
        id="currentPassword"
        label={currentPasswordLabel}
        type="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={handleChange}
        error={errors.currentPassword}
        disabled={submitting}
      />
      <FormField
        id="newPassword"
        label="Nowe hasło"
        type="password"
        autoComplete="new-password"
        placeholder="min. 8 znaków"
        value={values.newPassword}
        onChange={handleChange}
        error={errors.newPassword}
        disabled={submitting}
      />
      <FormField
        id="confirmNewPassword"
        label="Powtórz nowe hasło"
        type="password"
        autoComplete="new-password"
        value={values.confirmNewPassword}
        onChange={handleChange}
        error={errors.confirmNewPassword}
        disabled={submitting}
      />

      <button type="submit" className="auth-submit" disabled={submitting}>
        {submitLabel}
      </button>
    </form>
  )
}

export default ProfilePasswordForm
