import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { ApiError } from '../api/client'
import { confirmEmailChange } from '../api/account'
import { useAuth } from '../auth/authContext'
import { ROUTES } from '../routes'

/**
 * "Potwierdź nowy adres" — where the link mailed to the new address lands.
 *
 * A BUTTON, NOT AN AUTOMATIC REQUEST ON OPEN. Mail clients and scanners fetch
 * links to preview them; if opening this page changed the address, the scanner
 * would confirm it instead of the person. So the page asks, and only the button
 * sends the token (see core/email_change.py).
 *
 * Public, like pages/PasswordResetConfirm.tsx: the link is opened from a
 * mailbox, often on a device with no session. On success every session of the
 * account has ended, so the local one is dropped too and the next step is to
 * sign in under the new address.
 */

export const SUCCESS =
  'Adres e-mail został zmieniony. Zaloguj się nowym adresem — wszystkie sesje tego konta ' +
  'zostały zamknięte.'

export const MISSING_TOKEN =
  'Ten adres nie zawiera linku do potwierdzenia. Otwórz link z wiadomości e-mail albo ' +
  'poproś o zmianę adresu ponownie w swoim profilu.'

const GENERIC_ERROR = 'Nie udało się potwierdzić adresu. Spróbuj ponownie za chwilę.'

function EmailChangeConfirm() {
  const { token } = useParams<{ token: string }>()
  const { setUser } = useAuth()
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!token || status === 'submitting') return
    setStatus('submitting')
    setError(null)
    try {
      await confirmEmailChange(token)
      setUser(null)
      setStatus('done')
    } catch (cause: unknown) {
      setError((cause instanceof ApiError && cause.formMessage) || GENERIC_ERROR)
      setStatus('idle')
    }
  }

  const done = status === 'done'

  return (
    <AuthLayout
      title="Potwierdź nowy adres"
      subtitle="Ten krok zmienia adres e-mail, którym logujesz się do Mediculusa."
      successMessage={done ? SUCCESS : null}
      footer={
        <p className="auth-switch">
          <Link to={ROUTES.login}>{done ? 'Przejdź do logowania' : 'Wróć do logowania'}</Link>
        </p>
      }
    >
      {!token ? (
        <p className="auth-submit-error" role="alert">
          {MISSING_TOKEN}
        </p>
      ) : (
        !done && (
          <div className="auth-form">
            {error && (
              <p className="auth-submit-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="auth-submit"
              onClick={() => void confirm()}
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Potwierdzanie…' : 'Potwierdź nowy adres'}
            </button>
          </div>
        )
      )}
    </AuthLayout>
  )
}

export default EmailChangeConfirm
