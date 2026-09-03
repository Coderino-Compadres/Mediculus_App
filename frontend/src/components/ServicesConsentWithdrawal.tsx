import type { FormEvent } from 'react'
import FormField from './FormField'
import ProfileConfirmLayout from './ProfileConfirmLayout'
import { useAuth } from '../auth/authContext'
import { withdrawConsent } from '../api/account'
import { useAuthForm } from '../hooks/useAuthForm'
import { validatePassword } from '../utils/validation'
import { CONSENT_IDS, consentById } from '../utils/consents'

/**
 * Withdrawing only the consent to use the foundation's services.
 *
 * Its own screen rather than the shared closure one, because the consequences are
 * genuinely different — and, right now, genuinely unknown. The health-data
 * consent is the app's legal basis for holding anything at all, so withdrawing it
 * ends the account; this one is about the relationship with the foundation, and
 * whether that relationship is a precondition for using the app has never been
 * decided.
 *
 * THE OPEN QUESTION IS ANSWERED, AND THE ANSWER IS (b). It used to be recorded
 * here as undecided between "the account keeps working as a private diary" and
 * "it ends the use of the app, because the app *is* a service of the
 * foundation". The client settled it: without the consents there is no app.
 *
 * What that does *not* mean is deletion. Withdrawing either consent locks the
 * account — nothing is removed, and pages/ConsentsRequired.tsx offers it back.
 * So this screen no longer has to hedge, and no longer pretends the services
 * consent is the milder of the two: both lead to the same stopped account, and
 * the only thing that differs is which sentence the user is taking back.
 *
 * Still its own screen rather than folded into AccountClosureConfirm, because
 * the two consents are separate decisions (art. 7(3): consent is per purpose)
 * and a shared screen would quietly withdraw both.
 */

function ServicesConsentWithdrawal({ onBack }: { onBack: () => void }) {
  // Looked up here rather than at module scope: `consentById` throws on an
  // unknown id by design, and at module scope that throw lands during the eager
  // App -> Profile -> here import chain, blanking the entire app instead of the
  // one screen that could not be built.
  const servicesConsent = consentById(CONSENT_IDS.services)
  const { setUser } = useAuth()
  const { values, errors, formError, submitting, handleChange, handleSubmit } = useAuthForm({
    password: '',
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        password: validatePassword(currentValues.password),
      }),
      submit: async () => {
        // Handing the updated account to the session is what moves the app:
        // `needsConsents` flips and App.tsx's guard takes over from here.
        setUser(await withdrawConsent('services'))
      },
    })
  }

  const lead =
    'Wycofujesz tylko zgodę na korzystanie z usług Fundacji Mediculus. Zgoda na przetwarzanie danych o zdrowiu zostaje w mocy — to dwie osobne decyzje i wycofujesz jedną z nich. Aplikacja jest usługą fundacji, więc do czasu przywrócenia tej zgody konto będzie zatrzymane. Nic nie zostanie usunięte.'

  return (
    <ProfileConfirmLayout title="Wycofaj zgodę na usługi" lead={lead} onBack={onBack}>
      <section className="journal-detail-card">
        <h2>Zgoda, którą wycofujesz</h2>
        {/* The wording of record, from utils/consents.ts — the same sentence the
            registration form asked, so it is recognisable as the same promise. */}
        <p className="profile-consent-quote">{servicesConsent.label}</p>
      </section>

      <section className="journal-detail-card">
        <h2>Co się wtedy stanie</h2>
        {/* TODO(klientka): placeholder. See the note at the top of this file — the
            two candidate answers differ on whether the account survives, so this
            box must not be filled in with either until it is decided. */}
        <p className="profile-todo-box">
          <strong>Do ustalenia z Fundacją.</strong> Nie wiemy jeszcze, czy po wycofaniu tej zgody
          konto może dalej działać jako prywatny dzienniczek, czy wycofanie kończy korzystanie
          z aplikacji — i co dzieje się wtedy z wglądem specjalisty oraz z raportami, które już
          powstały. Dopiszemy to tutaj, kiedy będzie rozstrzygnięte. Jeśli chcesz zakończyć
          korzystanie z aplikacji już teraz, użyj „Usuń konto” — tam skutki są jednoznaczne.
        </p>
      </section>

      <section className="journal-detail-card">
        <h2>Potwierdź, że to Ty</h2>
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <p className="auth-hint">
            Podaj swoje hasło, żeby potwierdzić, że decyzję podejmujesz Ty.
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

          <button type="submit" className="auth-submit" disabled={submitting}>
            Wycofaj zgodę na usługi
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

export default ServicesConsentWithdrawal
