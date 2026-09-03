import { useEffect, useState, type FormEvent } from 'react'
import FormField from './FormField'
import ProfileConfirmLayout from './ProfileConfirmLayout'
import { PendingBackendError, deleteAccount, withdrawConsent } from '../api/account'
import { useAuth } from '../auth/authContext'
import { useAuthForm } from '../hooks/useAuthForm'
import { useSignOut } from '../hooks/useSignOut'
import { validatePassword } from '../utils/validation'
import type { AccountClosureReason } from '../types/profile'

/**
 * The confirmation for the three ways out: deleting the account, and withdrawing
 * either the health-data consent or both at once.
 *
 * THE THREE NO LONGER SHARE AN OUTCOME, AND THE COPY SAYS SO. Withdrawal used to
 * be described here as the same act as deletion — the reasoning being that this
 * app processes health data and nothing else, so without the art. 9 consent
 * there is no lawful basis to hold anything. The first half is right and the
 * conclusion was not: stopping the processing does not require destroying the
 * record, and equating them made exercising a right (art. 7(3)) irreversible an
 * hour later when somebody changed their mind. Withdrawal now **locks** the
 * account — pages/ConsentsRequired.tsx is where it lands, and the consents can
 * be given back from there. Deletion stays irreversible, which is why it is
 * still its own decision with its own list of what goes.
 *
 * One screen for all three anyway, because what varies is the title, the lead
 * and what happens on success; duplicating it per entry point is how three
 * screens start describing three different outcomes for two of them.
 *
 * The tone is meant to be plain: no red, no exclamation marks, no attempt to
 * talk anybody out of it. Withdrawing a consent is a right, not a mistake.
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
      'Wycofujesz zgodę na przetwarzanie danych o zdrowiu. Aplikacja przetwarza wyłącznie takie dane, więc bez tej zgody konto zostaje zatrzymane — nie otworzysz dzienniczka ani raportów. Nic nie zostanie usunięte i możesz przywrócić zgodę w każdej chwili.',
    action: 'Wycofaj zgodę',
  },
  'withdraw-all-consents': {
    title: 'Wycofaj obie zgody',
    lead:
      'Wycofujesz obie zgody naraz — na przetwarzanie danych o zdrowiu i na korzystanie z usług fundacji. Konto zostanie zatrzymane do czasu, aż przywrócisz przynajmniej te zgody. Twoje wpisy zostają na miejscu.',
    action: 'Wycofaj zgody',
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

//: What a withdrawal does instead, and the reason this list is separate from the
//: one above rather than a softened version of it. Nothing here is removed, so
//: reusing "Co zostanie usunięte" would have been a false statement on a screen
//: whose whole job is to be precise about consequences — which is exactly what
//: it was until the outcome changed.
const LOCKED_ITEMS = [
  'dzienniczek, raporty i analiza przestają się otwierać',
  'specjalista prowadzący przestaje widzieć nowe dane',
  'wszystko, co już zapisałaś lub zapisałeś, zostaje nietknięte',
  'zgodę możesz przywrócić w każdej chwili i konto wróci do stanu sprzed wycofania',
]

function AccountClosureConfirm({
  reason,
  onBack,
}: {
  reason: AccountClosureReason
  onBack: () => void
}) {
  const copy = COPY[reason]
  const { setUser } = useAuth()
  const deletes = reason === 'delete-account'
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
  //
  // Only for deletion. A withdrawal keeps the session — the account still
  // exists and its owner has to be able to reach the screen offering the
  // consents back, which signing them out would put behind a login they may no
  // longer want to perform.
  const closed = deletes && status === 'success' && pendingNotice === null
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
          if (deletes) {
            await deleteAccount({ password: currentValues.password, reason })
          } else {
            // The scope the backend needs is the one the entry point implies —
            // 'data' alone, or both. Never inferred from a checkbox the user did
            // not see.
            //
            // Handing the updated account to the session is what moves the app:
            // `needsConsents` flips, and App.tsx's guard takes over from here to
            // pages/ConsentsRequired.tsx. No navigate() call, so the redirect
            // cannot disagree with the guard that would have done it anyway.
            setUser(await withdrawConsent(
              reason === 'withdraw-data-consent' ? 'data' : 'all'))
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
          {/* Only deletion can reach this branch: `withdrawConsent` is a real
              call now and never raises PendingBackendError. */}
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
      {/* Two lists, and which one shows is the whole difference between the
          two decisions this screen serves. Deletion removes things; withdrawal
          stops the processing and removes nothing. */}
      <section className="journal-detail-card">
        <h2>{deletes ? 'Co zostanie usunięte' : 'Co się stanie'}</h2>
        <ul className="profile-confirm-list">
          {(deletes ? REMOVED_ITEMS : LOCKED_ITEMS).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
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
