import { useState, type FormEvent } from 'react'
import FormField from './FormField'
import ProfileConfirmLayout from './ProfileConfirmLayout'
import { PendingBackendError, withdrawConsent } from '../api/account'
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
 * TODO(klientka): what happens after this. Two plausible answers and they are
 * not close together:
 *   a) the account keeps working as a private diary — the patient stays, the
 *      relationship with the foundation and the specialist's access end;
 *   b) it ends the use of the app, like withdrawing the other consent, because
 *      the app *is* a service of the foundation and there is no "just the app".
 * Each also decides what happens to the specialist's access and to the reports
 * already generated. Nothing below invents an answer: the consequences box says
 * plainly that this is being settled, which is the only truthful thing this
 * screen can currently say. Filling it in with a guess would be worse than the
 * gap — somebody would act on it.
 */

function ServicesConsentWithdrawal({ onBack }: { onBack: () => void }) {
  // Looked up here rather than at module scope: `consentById` throws on an
  // unknown id by design, and at module scope that throw lands during the eager
  // App -> Profile -> here import chain, blanking the entire app instead of the
  // one screen that could not be built.
  const servicesConsent = consentById(CONSENT_IDS.services)
  const [pendingNotice, setPendingNotice] = useState<string | null>(null)
  const { values, errors, formError, status, submitting, handleChange, handleSubmit } = useAuthForm({
    password: '',
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(event, {
      validate: (currentValues) => ({
        password: validatePassword(currentValues.password),
      }),
      submit: async () => {
        try {
          await withdrawConsent('services')
        } catch (error) {
          if (error instanceof PendingBackendError) {
            setPendingNotice(error.message)
            return
          }
          throw error
        }
      },
    })
  }

  const lead =
    'Wycofujesz tylko zgodę na korzystanie z usług Fundacji Mediculus. Zgoda na przetwarzanie danych o zdrowiu zostaje w mocy — to dwie osobne decyzje i wycofujesz jedną z nich.'

  // Gated on `pendingNotice`, not on `status`: the sentence below asserts that the
  // consent still stands, and only the stub's own answer entitles us to say so.
  // On `status` alone, a working endpoint would say "nic nie zostało wycofane"
  // immediately after withdrawing the consent.
  if (pendingNotice !== null) {
    return (
      <ProfileConfirmLayout title="Wycofaj zgodę na usługi" lead={lead} onBack={onBack}>
        <section className="journal-detail-card">
          <p className="profile-pending-notice" role="status">
            {pendingNotice}
          </p>
          <p className="profile-confirm-note">
            Twoja zgoda nadal obowiązuje — nic nie zostało wycofane.
          </p>
          <button type="button" className="auth-submit auth-submit-secondary" onClick={onBack}>
            Wróć do profilu
          </button>
        </section>
      </ProfileConfirmLayout>
    )
  }

  /*
   * The real outcome, once the endpoint exists. Unlike the closure screen this one
   * cannot say what happens next, and deliberately does not try: a resolved
   * `withdrawConsent('services')` proves exactly one thing — the consent is
   * withdrawn — while what it means for the account and for the specialist's
   * access is the open question at the top of this file.
   *
   * TODO(klientka): once that is decided, this is where it gets said — and if the
   * answer is (b), "the account ends too", this branch should stop existing and
   * the whole path should lead to AccountClosureConfirm instead.
   */
  if (status === 'success') {
    return (
      <ProfileConfirmLayout title="Wycofaj zgodę na usługi" lead={lead} onBack={onBack}>
        <section className="journal-detail-card">
          <p className="profile-confirm-note" role="status">
            Zgoda na korzystanie z usług Fundacji Mediculus została wycofana.
          </p>
          <button type="button" className="auth-submit auth-submit-secondary" onClick={onBack}>
            Wróć do profilu
          </button>
        </section>
      </ProfileConfirmLayout>
    )
  }

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
