import { useEffect, useState, type FormEvent } from 'react'
import FormField from './FormField'
import ProfileConfirmLayout from './ProfileConfirmLayout'
import { PendingBackendError, deleteAccount, withdrawConsent } from '../api/account'
import { useAuth } from '../auth/authContext'
import { useAuthForm } from '../hooks/useAuthForm'
import { useSignOut } from '../hooks/useSignOut'
import { validatePassword } from '../utils/validation'
import type { AccountClosureReason } from '../types/profile'
// The consequence lists, the pending notice and the filled confirming
// button; `.journal-detail-card` for the sections; `auth-*` for the password
// form. All three named here so this screen is dressed wherever it is opened
// from.
import './profileForms.css'
import '../pages/journalDetail.css'
import './auth.css'

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
 *
 * IT COVERS BOTH MODULES, because there is one account and one deletion. The
 * list used to name the psychotherapy diary and its reports and stop there —
 * which was complete when it was written and had quietly stopped being so five
 * tables later: meals, hydration, supplements and their intakes, activity and
 * sleep all belong to the same person and all go with the account. An omission
 * on *this* screen is not incompleteness, it is a false statement: this is the
 * one place in the app where somebody is told what will happen to their health
 * data, and they decide on the strength of it.
 *
 * ONE LIST, NEVER A PER-MODULE VARIANT. Confirmed by the team on the backend's
 * side: **deleting the account from anywhere deletes everything**, the
 * psychotherapy data and the diet data together, and the scope does not depend
 * on which profile the screen was opened from. So this array is not to be
 * split in two, not to be filtered by route, and not to be keyed on
 * `moduleLabel` — that prop exists to say *where the reader is standing*, and
 * it is the only thing about this screen that may differ between the two
 * entry points. Wording the consequences to match the door somebody came
 * through would describe a deletion narrower than the one that happens, on the
 * screen where they consent to it.
 *
 * `DietProfile.test.tsx` renders this screen from /profile and from
 * /diet/profile and asserts the two lists are identical item for item, so the
 * split cannot be reintroduced quietly.
 *
 * The health profile joined the list with its migration
 * (`core/migrations/0021_health_profile.py`) and not a commit before it: while
 * there was no table, naming it here would have promised the deletion of
 * something that was not stored. That is the rule for the next entry too — a
 * line goes in when the data does, never in anticipation of it.
 */
const REMOVED_ITEMS = [
  'wpisy w dzienniczku wraz z ocenami nastroju, emocji, napięcia i energii',
  'raporty tygodniowe wygenerowane z tych wpisów, razem z ich wersjami PDF',
  'wpisy w dzienniczku żywieniowym: posiłki wraz z opisami, godzinami i emocjami przy jedzeniu',
  'zapisane nawodnienie, sen i aktywność fizyczna',
  'lista suplementów i leków razem z odhaczeniami przyjęcia',
  'raporty tygodniowe z części dietetycznej i psychodietetycznej',
  'profil zdrowotny: wzrost, masa ciała, masa docelowa, poziom aktywności, alergie, nietolerancje, preferencje żywieniowe i jednostki chorobowe',
  'dane konta: imię, nazwisko, adres e-mail, data urodzenia',
  'powiązanie ze specjalistą prowadzącym i jego wgląd w Twoje dane',
]

//: What a withdrawal does instead, and the reason this list is separate from the
//: one above rather than a softened version of it. Nothing here is removed, so
//: reusing "Co zostanie usunięte" would have been a false statement on a screen
//: whose whole job is to be precise about consequences — which is exactly what
//: it was until the outcome changed.
//:
//: IT COVERS BOTH MODULES, ON THE SAME REASONING AS REMOVED_ITEMS ABOVE, and
//: for a reason that is structural rather than editorial: there is one account
//: and one gate. `HasActiveConsents` (core/permissions.py) refuses every
//: endpoint behind it, and both modules are behind it — so withdrawing a
//: consent stops the whole app, not the half the reader happens to be standing
//: in.
//:
//: The first line used to read "dzienniczek, raporty i analiza przestają się
//: otwierać". Every one of those three words now names a screen in *each*
//: module — /journals and /diet/journals, /reports and /diet/reports,
//: /analysis and /diet/analysis — so a patient reading it recognised her own
//: half of the app and had no reason to think the other half was included.
//: Ambiguity on a consequences screen is not a smaller problem than an
//: omission: both leave somebody consenting to something other than what
//: happens. The two halves are therefore named the way the app's own menu
//: names them ("część psychoterapeutyczna", "część dietetyczna i
//: psychodietetyczna").
//:
//: ONE LIST, NEVER A PER-MODULE VARIANT — the same rule as REMOVED_ITEMS, and
//: not to be split, filtered by route or keyed on `moduleLabel`.
//: `DietProfile.test.tsx` opens this screen from both profiles and asserts the
//: two lists are identical item for item.
const LOCKED_ITEMS = [
  'część psychoterapeutyczna przestaje się otwierać: dzienniczek emocji, raporty tygodniowe i analiza',
  'część dietetyczna i psychodietetyczna również: dzienniczek żywieniowy, nawodnienie, suplementy i leki, sen i aktywność, raporty i analiza',
  'specjalista prowadzący przestaje widzieć nowe dane',
  'wszystko, co już zapisałaś lub zapisałeś, zostaje nietknięte',
  'zgodę możesz przywrócić w każdej chwili i konto wróci do stanu sprzed wycofania',
]

function AccountClosureConfirm({
  reason,
  onBack,
  moduleLabel,
}: {
  reason: AccountClosureReason
  onBack: () => void
  /** Which module the reader came from — forwarded to ProfileConfirmLayout,
   *  which defaults it to the psychotherapy one. Both profiles open this
   *  screen and it has to say where it is being opened. */
  moduleLabel?: string
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
      <ProfileConfirmLayout
        title={copy.title}
        lead={copy.lead}
        onBack={onBack}
        moduleLabel={moduleLabel}
      >
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
    <ProfileConfirmLayout
        title={copy.title}
        lead={copy.lead}
        onBack={onBack}
        moduleLabel={moduleLabel}
      >
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
