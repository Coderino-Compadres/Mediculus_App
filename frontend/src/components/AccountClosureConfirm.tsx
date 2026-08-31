import { useEffect, useState, type FormEvent } from 'react'
import FormField from './FormField'
import ProfileConfirmLayout from './ProfileConfirmLayout'
import { PendingBackendError, deleteAccount, withdrawConsent } from '../api/account'
import { useAuthForm } from '../hooks/useAuthForm'
import { useSignOut } from '../hooks/useSignOut'
import { validatePassword } from '../utils/validation'
import type { AccountClosureReason } from '../types/profile'

/**
 * The one confirmation screen for every route that ends the account.
 *
 * Three ways in, one screen, on purpose:
 *  - "Usuń konto",
 *  - withdrawing the art. 9 consent to process health data,
 *  - withdrawing both consents at once.
 *
 * The middle one is not a milder version of the first. This app processes health
 * data and nothing else, so without that consent there is no lawful basis left
 * for it to hold anything — the outcome is the same, and a screen that implied
 * otherwise would be softening a decision the user cannot take back. Duplicating
 * the screen per entry point is how the three would start describing different
 * outcomes, so what varies is only the title and the sentence explaining how the
 * user got here.
 *
 * The tone is meant to be plain: no red, no exclamation marks, no attempt to
 * talk anybody out of it. Withdrawing a consent is a right, not a mistake. But
 * nothing is glossed over either — the list below is specific, and the
 * irreversibility is stated once, clearly.
 */

interface Copy {
  title: string
  lead: string
  /** On the confirming button — it should name the action, not say "OK". */
  action: string
}

const COPY: Record<AccountClosureReason, Copy> = {
  'delete-account': {
    title: 'Usuń konto',
    lead:
      'Chcesz trwale usunąć swoje konto w Mediculusie. Zanim to potwierdzisz, sprawdź, co dokładnie zniknie.',
    action: 'Usuń konto na stałe',
  },
  'withdraw-data-consent': {
    title: 'Wycofaj zgodę na dane o zdrowiu',
    lead:
      'Wycofujesz zgodę na przetwarzanie danych o zdrowiu. Aplikacja przetwarza wyłącznie takie dane — bez tej zgody nie ma czego prowadzić, więc wycofanie jej kończy korzystanie z konta i usuwa jego dane. To ten sam skutek co usunięcie konta.',
    action: 'Wycofaj zgodę i zamknij konto',
  },
  'withdraw-all-consents': {
    title: 'Wycofaj obie zgody',
    lead:
      'Wycofujesz obie zgody naraz — na przetwarzanie danych o zdrowiu i na korzystanie z usług fundacji. Pierwsza z nich jest podstawą działania aplikacji, więc skutek jest ten sam co przy usunięciu konta.',
    action: 'Wycofaj zgody i zamknij konto',
  },
}

/**
 * What goes.
 *
 * Written out rather than summarised as "wszystkie dane": the point of the screen
 * is that the person knows what they are agreeing to lose, and "wszystkie" is a
 * word everyone reads as slightly less than it says.
 */
const REMOVED_ITEMS = [
  'wpisy w dzienniczku wraz z ocenami nastroju, emocji, napięcia i energii',
  'raporty tygodniowe wygenerowane z tych wpisów, razem z ich wersjami PDF',
  'dane konta: imię, nazwisko, adres e-mail, data urodzenia',
  'powiązanie ze specjalistą prowadzącym i jego wgląd w Twoje dane',
]

function AccountClosureConfirm({
  reason,
  onBack,
}: {
  reason: AccountClosureReason
  onBack: () => void
}) {
  const copy = COPY[reason]
  // Set when the API stub tells us the backend is not there yet. Rendered as a
  // notice, not as an error: nothing failed, and — crucially — nothing happened.
  const [pendingNotice, setPendingNotice] = useState<string | null>(null)
  const signOutAndLeave = useSignOut()
  const { values, errors, formError, status, submitting, handleChange, handleSubmit } = useAuthForm({
    password: '',
  })

  /**
   * The real outcome, once the endpoints exist: all three routes into this screen
   * end the account, so the session behind it is gone and there is nothing left
   * for the app to render. Signing out and leaving is the only honest next step —
   * staying would show a logged-in shell over a deleted account until the first
   * request failed.
   *
   * Keyed on the absence of `pendingNotice`, which is what separates "the stub
   * answered" from "the work happened". Today it never runs.
   */
  const closed = status === 'success' && pendingNotice === null
  useEffect(() => {
    if (closed) void signOutAndLeave()
  }, [closed, signOutAndLeave])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        password: validatePassword(currentValues.password),
      }),
      submit: async (currentValues) => {
        try {
          if (reason === 'delete-account') {
            await deleteAccount({ password: currentValues.password, reason })
          } else {
            // The scope the backend needs is the one the entry point implies —
            // 'data' alone, or both. Never inferred from a checkbox the user did
            // not see.
            await withdrawConsent(reason === 'withdraw-data-consent' ? 'data' : 'all')
          }
        } catch (error) {
          // The expected outcome today. Swallowed rather than rethrown so the
          // user gets the honest notice instead of "Coś poszło nie tak" — this
          // is not a failure, it is an unbuilt half.
          if (error instanceof PendingBackendError) {
            setPendingNotice(error.message)
            return
          }
          throw error
        }
      },
    })
  }

  // Gated on `pendingNotice` rather than on `status`, and the difference is the
  // whole point of this screen: the sentence below asserts that nothing happened,
  // and only the stub's own answer entitles us to say that. Keyed on `status`
  // alone, the first working endpoint would tell somebody whose account had just
  // been deleted that their data was untouched.
  if (pendingNotice !== null) {
    return (
      <ProfileConfirmLayout title={copy.title} lead={copy.lead} onBack={onBack}>
        <section className="journal-detail-card">
          <p className="profile-pending-notice" role="status">
            {pendingNotice}
          </p>
          <p className="profile-confirm-note">
            Twoje konto i dane są nietknięte. Kiedy backend będzie gotowy, to samo potwierdzenie
            wykona operację naprawdę.
          </p>
          <button type="button" className="auth-submit auth-submit-secondary" onClick={onBack}>
            Wróć do profilu
          </button>
        </section>
      </ProfileConfirmLayout>
    )
  }

  // Sign-out is on its way (see `closed` above); render nothing rather than a
  // screen that would claim anything about an account that no longer exists.
  if (closed) return null

  return (
    <ProfileConfirmLayout title={copy.title} lead={copy.lead} onBack={onBack}>
      <section className="journal-detail-card">
        <h2>Co zostanie usunięte</h2>
        <ul className="profile-confirm-list">
          {REMOVED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {/* Ochre, like every other cautionary marker in this app — never the
            error red. It is a consequence, not a mistake. */}
        <p className="profile-confirm-warning">
          Tej operacji nie można cofnąć. Nie ma kosza ani kopii, do której da się wrócić — jeśli
          chcesz zachować swoje wpisy i raporty, pobierz je najpierw w sekcji „Twoje dane i zgody”.
        </p>

        {/* TODO(prawnik + klientka): the list above is what the screen promises,
            and it may promise too much. If diary entries and the reports shared
            with a specialist count as medical records, the organization can be
            obliged to keep them — in which case some of this cannot be deleted on
            request and the wording has to say so (pseudonymization instead of
            deletion is the likely answer; medical_db already holds nothing but
            `id_medical`). Same open question as the medical-device classification
            on the project's legal list. Settle it before the backend is written,
            not after: a delete that quietly keeps things is worse than no delete. */}
      </section>

      <section className="journal-detail-card">
        <h2>Potwierdź, że to Ty</h2>
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <p className="auth-hint">
            Podaj swoje hasło. Pytamy o nie, żeby nikt, kto ma chwilowy dostęp do Twojego telefonu,
            nie mógł podjąć tej decyzji za Ciebie.
          </p>

          {formError && (
            <p className="auth-submit-error" role="alert">
              {formError}
            </p>
          )}

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

          <button type="submit" className="auth-submit profile-danger-button" disabled={submitting}>
            {copy.action}
          </button>
          <button
            type="button"
            className="auth-submit auth-submit-secondary"
            onClick={onBack}
            disabled={submitting}
          >
            Anuluj
          </button>
        </form>
      </section>
    </ProfileConfirmLayout>
  )
}

export default AccountClosureConfirm
