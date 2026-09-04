import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import CrisisLines from '../components/CrisisLines'
import FormField from '../components/FormField'
import SpecialistInvitationCard from '../components/SpecialistInvitation'
import { useAuthForm } from '../hooks/useAuthForm'
import { useAuth } from '../auth/authContext'
import {
  GUARDIAN_FIELDS,
  cancelGuardianInvitation,
  fetchCurrentUser,
  isGuardianInvitationPending,
  linkGuardian,
  type AuthUser,
} from '../api/auth'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import { validateEmail } from '../utils/validation'

/**
 * The one screen a minor's account can reach before a guardian vouches for it.
 *
 * Consent to process health data ticked by a minor alone is not valid consent
 * (RODO art. 8), so the account stays unusable until an adult's account accepts
 * — hence a full screen rather than a banner, and hence the sign-out in the
 * footer: it is the only other thing to do from here.
 *
 * Two states, because naming a guardian and being vouched for are not the same
 * thing: the form, and then the wait for an answer the child cannot give itself.
 *
 * BOTH STATES CARRY THE SUPPORT NUMBERS, and that is not decoration. This is the
 * only screen an unlinked minor can reach: RequireAuth redirects them here from
 * everywhere else, including "Plan bezpieczeństwa", and there is no header menu
 * on this page. Without the panel below, a 15-year-old waiting on a guardian who
 * has not logged in yet has no route to any helpline in the app at all — the two
 * lines published for under-18s included. The guardian gate exists so that an
 * unvouched-for minor does not WRITE clinical data (RODO art. 8); a list of
 * public national numbers is neither clinical data nor anything a guardian
 * consents to, so it is not what the gate is for.
 *
 * AND BOTH STATES CARRY THE SPECIALIST'S INVITATION, for a reason of exactly the
 * same shape. `_require_patient` lets an unlinked minor answer a specialist
 * (`GUARDIAN_GATE_EXEMPT_REASON` in core/views.py) because that answer is what
 * lets the specialist issue the code a *parent* registers with — the way out of
 * the gate for a child whose guardian has no account yet. But the card lived on
 * /home only, and RequireAuth redirects an unlinked minor here from /home, so
 * the child had no button to press: the specialist saw "oczekujące" and the
 * child saw a screen that never mentioned it. The API exemption without this
 * card was an exemption in name only.
 */
function LinkGuardian() {
  const { user } = useAuth()

  if (user && isGuardianInvitationPending(user)) return <AwaitingAnswer />
  return <InviteGuardian />
}

/**
 * The form. The guardian must already have their own account: naming an address
 * that has none is answered as a field error, not as an invitation, because
 * sending mail is something the backend cannot do yet.
 */
function InviteGuardian() {
  const { user, setUser } = useAuth()
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
        // The answer carries the new status, so this screen swaps itself for the
        // waiting state without a second trip through /api/auth/me/.
        setUser(await linkGuardian(currentValues))
      },
      fields: GUARDIAN_FIELDS,
    })
  }

  return (
    <GuardianLayout
      title="Powiąż konto z opiekunem"
      subtitle="Konto osoby małoletniej działa dopiero wtedy, gdy rodzic lub opiekun potwierdzi powiązanie."
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
          Podaj adres konta typu „konto rodzica lub opiekuna". Adres konta pacjenta nie
          zostanie przyjęty. Opiekun zobaczy prośbę po zalogowaniu i sam zdecyduje, czy ją
          przyjąć — do tego czasu konto pozostaje nieaktywne.
        </p>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Wysyłanie…' : 'Wyślij prośbę'}
        </button>
      </form>

      {/* Below the form, deliberately: the guardian link is what unblocks the
          account, and a specialist's invitation is not. It draws nothing at all
          when nobody has asked, which is the ordinary case here. */}
      <SpecialistInvitationCard />
    </GuardianLayout>
  )
}

/**
 * The wait. Nothing here can accept on the child's behalf — that is the whole
 * point of the flow — so the only two actions are checking for an answer and
 * withdrawing the request, which is what makes a mistyped address recoverable.
 */
function AwaitingAnswer() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'checking' | 'cancelling' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'checking' | 'cancelling') {
    setBusy(action)
    setError(null)
    try {
      const updated =
        action === 'checking' ? await fetchCurrentUser() : await cancelGuardianInvitation()
      applySession(updated)
    } catch (error) {
      if (action === 'cancelling' && error instanceof ApiError && error.status === 404) {
        await recoverFromVanishedInvitation()
      } else {
        // Two buttons, two failures: telling a child whose withdrawal was
        // refused that the *check* failed describes something they did not do.
        setError(
          action === 'checking'
            ? 'Nie udało się sprawdzić stanu zaproszenia. Spróbuj ponownie.'
            : 'Nie udało się anulować prośby. Spróbuj ponownie.',
        )
      }
    } finally {
      setBusy(null)
    }
  }

  /** A cancelled invitation puts this screen back to the form; an accepted one
   *  lets the route guard send the child into the app. */
  function applySession(updated: AuthUser | null) {
    setUser(updated)
    if (updated === null) navigate(ROUTES.login, { replace: true })
  }

  /**
   * DELETE answered 404: there is no pending invitation left to withdraw, and
   * the usual reason is that the guardian accepted it a moment earlier. The
   * child is then not stuck at all, so re-read the session and let it decide
   * which screen this is — reporting a failure would leave them waiting for an
   * answer that has already arrived.
   */
  async function recoverFromVanishedInvitation() {
    try {
      applySession(await fetchCurrentUser())
    } catch {
      setError('Prośba nie czeka już na odpowiedź. Odśwież stronę, aby zobaczyć stan konta.')
    }
  }

  return (
    <GuardianLayout
      title="Prośba czeka na odpowiedź"
      subtitle="Wysłaliśmy prośbę o powiązanie konta. Rodzic lub opiekun zobaczy ją po zalogowaniu się do Mediculusa."
    >
      {error && (
        <p className="auth-submit-error" role="alert">
          {error}
        </p>
      )}

      <p className="auth-hint">
        Konto zostanie odblokowane dopiero po akceptacji — bez niej nikt nie zgodził się na
        przetwarzanie Twoich danych. Jeśli podałeś zły adres, anuluj prośbę i wyślij ją
        ponownie.
      </p>

      <div className="auth-form">
        <button
          type="button"
          className="auth-submit"
          onClick={() => void run('checking')}
          disabled={busy !== null}
        >
          {busy === 'checking' ? 'Sprawdzanie…' : 'Sprawdź, czy jest już odpowiedź'}
        </button>
        <button
          type="button"
          className="auth-submit auth-submit-secondary"
          onClick={() => void run('cancelling')}
          disabled={busy !== null}
        >
          {busy === 'cancelling' ? 'Anulowanie…' : 'Anuluj prośbę i podaj inny adres'}
        </button>
      </div>

      <SpecialistInvitationCard />
    </GuardianLayout>
  )
}

/** Both states share the card and the way out of it. */
function GuardianLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  const { signOut } = useAuth()

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      footer={
        <p className="auth-switch">
          To nie Twoje konto?{' '}
          <button type="button" className="auth-link-button" onClick={() => void signOut()}>
            Wyloguj się
          </button>
        </p>
      }
    >
      {children}
      <CrisisLines className="crisis-lines-in-card" />
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
