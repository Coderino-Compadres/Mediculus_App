import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AccountClosureConfirm from '../components/AccountClosureConfirm'
import CollapsibleCard from '../components/CollapsibleCard'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import ProfileAvatar from '../components/ProfileAvatar'
import ProfileDataRights from '../components/ProfileDataRights'
import ProfileEmailForm from '../components/ProfileEmailForm'
import ProfilePasswordForm from '../components/ProfilePasswordForm'
import ServicesConsentWithdrawal from '../components/ServicesConsentWithdrawal'
import { ApiError } from '../api/client'
import { fetchHealthProfile, saveHealthProfile } from '../api/healthProfile'
import { useAuth } from '../auth/authContext'
import { useAccountProfile } from '../hooks/useAccountProfile'
import { MODULE_DIET } from '../utils/modules'
import { useSignOut } from '../hooks/useSignOut'
import {
  ACTIVITY_LEVELS,
  CONDITIONS,
  emptyHealthProfile,
  measurementProblem,
  toHealthProfileInput,
  typeMeasurement,
} from '../utils/healthProfile'
import { fullName } from '../utils/profile'
import { roleLabel } from '../utils/roles'
import { ageFromDateOfBirth, pluralYears } from '../utils/validation'
import { ROUTES } from '../routes'
import type { AccountClosureReason } from '../types/profile'
import type {
  ActivityLevel,
  ConditionId,
  HealthProfileDraft,
} from '../types/healthProfile'
import './dietProfile.css'

/**
 * "Profil" — §13 of the diet mockups, the patient's own health profile.
 *
 * WHY THIS SCREEN EXISTS SEPARATELY FROM /profile. Both mockup sets say the
 * profile is shared ("Profil jest wspólny dla obu modułów"); the team decided
 * otherwise and that decision wins. The reasoning survives the disagreement:
 * what §13 puts in the middle of this screen — a body, a set of diagnoses, the
 * way somebody eats — has no business on a psychotherapy profile, and
 * /profile's middle (the diary counters, the "Terapeuta" row) has none here.
 *
 * WHAT IS NOT DUPLICATED IS EVERYTHING THE TWO ACTUALLY SHARE. The consent
 * register, the e-mail form, the password form and signing out are the *same
 * components* as on /profile, not copies of them — `ProfileDataRights`,
 * `ProfileEmailForm`, `ProfilePasswordForm`, `useSignOut`. That is the half of
 * the team's decision that costs something to get wrong: a second
 * implementation of "withdraw a consent" is a second thing that can be wrong
 * about a right (RODO art. 7(3)), and two consent registers can disagree about
 * what somebody agreed to.
 *
 * ── NOTHING ON THIS SCREEN IS INVENTED ABOUT A PERSON ───────────────────────
 *
 * The health fields hold **what the server has on file and nothing else**.
 * `fetchHealthProfile` reads `GET /api/account/health-profile/`; a patient who
 * has filled nothing in gets empty fields because the profile is genuinely
 * empty, and a request that *fails* gets an error rather than empty fields —
 * see HEALTH_LOAD_ERROR below for why that difference is worth a branch.
 *
 * The temptation this paragraph exists to defuse is filling them in with the
 * artboard's 168 cm and 71 kg "so the screen shows something". `src/data/
 * profile.ts` did exactly that with the mockup's example patient and was
 * deleted for it. A weight is not decoration: printed into somebody's own
 * profile it is a statement about that person's body, shown to that person, in
 * a module whose §13 says in so many words that some of its users have eating
 * disorders. The source of these values is the endpoint; nobody types example
 * values in here.
 *
 * Everything that IS real comes from where it really lives: identity and the
 * consents from the session (`useAuth`), the treating specialist from
 * `GET /api/account/profile/` (`useAccountProfile`), the age computed from
 * `user.dateOfBirth`. None of it is faked and none of it is re-fetched.
 *
 * ── THE SAFEGUARDS §13 ASKS FOR ────────────────────────────────────────────
 *
 * Mass and target mass are two ordinary fields side by side and the screen
 * does nothing else with them: no progress bar between them, no "zostało X
 * kg", no difference, no BMI, no chart, no history, and no comment on any
 * value ("w normie", "cel osiągnięty"). §13 states each of those and gives the
 * reason: "Wśród pacjentek są osoby z zaburzeniami odżywiania — te dwie liczby
 * są danymi dla specjalisty, nie celem pokazywanym codziennie." They are also
 * absent from the rest of the app by design — `DietProfile.test.tsx` renders
 * the module's other screens and sweeps them for the words.
 *
 * ── TWO FORM CONVENTIONS ON ONE SCREEN, DELIBERATELY ───────────────────────
 *
 * The health sections are built the diet module's way (own `diet-profile-`
 * classes, own stylesheet, hints as their own element, chips in ochre, nothing
 * blocking a save) — the DietSupplements pattern. The account sections are
 * left exactly as they are on /profile, `auth-*` classes and all, because they
 * are the same form for the same account and a patient crossing between the
 * modules must not find the password field changing shape on the way.
 *
 * The mixture is the design, not an oversight, and it should not be
 * "unified" in either direction: unifying downward would restyle the
 * psychotherapy profile's forms from a diet screen, and unifying upward would
 * make the one module that deliberately dresses itself (see the header of
 * dietProfile.css) wear another screen's class names.
 *
 * ── WHAT THIS SCREEN DELIBERATELY DOES NOT HOLD ────────────────────────────
 *
 * TODO(§08): **medicines.** §13 lists "leki" among the profile's fields and
 * `/diet/supplements` already keeps them with a dose, a frequency, hours, start
 * and end dates and a daily tick. §08's own note leaves open whether the
 * profile's list is that data or a second entry — "do ustalenia, czy to jedno
 * źródło danych, czy dwa osobne wpisy" — so there is no medicine field here
 * and no link in either direction. Answering an open question in markup is
 * still answering it.
 *
 * THE CARD BELOW NAMES THIS MODULE'S SPECIALIST, which §13 asks for and which
 * the schema could not express until migration 0022: `patient.id_specjalist`
 * was a single FK, so both profile screens named the same person. Now the
 * relationship lives in `specjalist_patient` with a module on it, this screen
 * asks `/api/diet/profile/` and /profile asks its own — two cards, two people,
 * exactly as the artboard draws them. What is still not drawn is §13's coloured
 * dot: the module is said in words on each screen instead, since each screen
 * only ever shows its own.
 *
 * Also absent: the artboard's "konto od 3 marca" (the API sends no creation
 * date), its consent toggles (consents have one mechanism, `ProfileDataRights`)
 * and any way to change a name or a date of birth (`UserSerializer` is
 * `read_only_fields = fields`).
 */

const MODULE_LABEL = 'DIETETYKA I PSYCHODIETETYKA'

/** Height in centimetres, mass in kilograms — three digits is past any real
 *  value and stops a paste turning a field into a wall of digits. */
const MAX_MEASUREMENT_DIGITS = 3

const CARE_LOAD_ERROR = 'Nie udało się wczytać danych o specjaliście.'

/**
 * A load that failed, and the reason this screen may not answer it with blank
 * fields.
 *
 * CLAUDE.md's rule for the whole app is that a failed load is never rendered as
 * an empty one, and on this screen the cost is higher than on a list. Empty
 * health fields do not read as "we could not fetch this"; they read as "you
 * have not filled anything in" — a statement about the reader — and the first
 * thing somebody does about that is type their allergies in again, over the top
 * of answers the server still holds.
 *
 * Used only when the server said nothing usable itself; `ApiError.formMessage`
 * wins, as it does on every other screen in this module.
 */
const HEALTH_LOAD_ERROR =
  'Nie udało się wczytać Twojego profilu zdrowotnego. To nie znaczy, że jest ' +
  'pusty — nie udało się go pobrać.'

/**
 * A save that failed — sent, and not stored.
 *
 * The distinction this wording carries is the one a patient cannot see for
 * themselves: the button comes back enabled either way, so without a sentence
 * here a lost save and a successful one look identical.
 */
const HEALTH_SAVE_ERROR =
  'Nie udało się zapisać profilu. Twoje odpowiedzi zostały tutaj — spróbuj ' +
  'zapisać jeszcze raz.'

/**
 * What the screen has to say about the last submit — one state, never two.
 *
 * A union rather than a notice string beside an error string, because the three
 * outcomes are three different claims and the bug worth making impossible is
 * showing two of them at once: "nic nie zostało wysłane" under a failed request
 * would contradict the alert above it, on the one screen where somebody is
 * deciding whether their allergies got through.
 */
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  /** Stored. Said plainly, because on this screen it is a real claim: somebody
   *  wrote down an allergy and expects their dietitian to read it. */
  | { kind: 'saved' }
  /** Sent and lost. Ochre and role="alert" — see dietProfile.css. */
  | { kind: 'failed'; message: string }

/**
 * Which of the profile's screens is on show.
 *
 * Local state rather than routes, for the same reason `pages/Profile.tsx` does
 * it: the confirmations are steps inside one decision, and giving them
 * addresses would put "you are about to delete your account" in the history,
 * one back-button press away from somebody who already said no.
 */
type ProfileView =
  | { kind: 'profile' }
  | { kind: 'closure'; reason: AccountClosureReason }
  | { kind: 'services-consent' }

/**
 * One measurement field.
 *
 * The unit travels in the label *and* in a hint tied by `aria-describedby`,
 * never as a bare "kg" floating beside the box: a symbol next to an input is
 * not part of the accessible name, so a screen reader would announce "Masa
 * ciała, edycja tekstu" and leave the unit on the screen for people who can
 * see it.
 *
 * `type="text"` with `inputMode="decimal"` rather than `type="number"`, which
 * is the choice `DietActivityPanel` already made for the step count: a number
 * input hands back '' for anything the browser dislikes, so a half-typed
 * "71," clears itself under the caret.
 */
function MeasurementField({
  id,
  label,
  unit,
  value,
  hint,
  onChange,
}: {
  id: string
  label: string
  unit: 'cm' | 'kg'
  value: string
  hint: string
  onChange: (next: string) => void
}) {
  const problem = measurementProblem(value, unit)
  const hintId = `${id}-hint`
  const problemId = `${id}-problem`

  return (
    <div className="diet-profile-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        aria-invalid={problem !== null}
        aria-describedby={problem ? `${hintId} ${problemId}` : hintId}
        onChange={(event) =>
          onChange(typeMeasurement(event.target.value, MAX_MEASUREMENT_DIGITS))
        }
      />
      <p className="diet-profile-hint" id={hintId}>
        {hint}
      </p>
      {/* A request to check, not a verdict — and never a reason the form
          cannot be submitted. */}
      {problem && (
        <span className="diet-profile-field-notice" id={problemId}>
          {problem}
        </span>
      )}
    </div>
  )
}

/** A free-text eating field: allergies, intolerances, preferences. */
function DescriptiveField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (next: string) => void
}) {
  const hintId = `${id}-hint`
  return (
    <div className="diet-profile-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={2}
        value={value}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="diet-profile-hint" id={hintId}>
        {hint}
      </p>
    </div>
  )
}

/**
 * A multi-select chip.
 *
 * A `<button aria-pressed>` rather than a checkbox, and the choice is about
 * matching what this module already does: `DietActivityPanel`,
 * `TechniqueSchoolTabs` and the emotion picker are all pressed-state buttons,
 * and a checkbox grid here would be the one place in the module where picking
 * something looks and sounds different. `aria-pressed` carries the state to a
 * screen reader as "wciśnięty", which is what a checkbox would have given us
 * anyway, and the group is a real `<fieldset>`/`<legend>` so the seventeen are
 * announced as one question rather than seventeen.
 *
 * THE STATE IS NOT CARRIED BY COLOUR. WCAG 1.4.1: the ochre fill is joined by
 * a heavier border and by a tick rendered into the markup, so a picked chip is
 * a picked chip in greyscale, in daylight and to a reader.
 */
function Chip({
  label,
  pressed,
  onToggle,
}: {
  label: string
  pressed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="diet-profile-chip"
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {pressed && (
        <span className="diet-profile-chip-tick" aria-hidden="true">
          ✓
        </span>
      )}
      {label}
    </button>
  )
}

/**
 * The treating specialist, from `GET /api/account/profile/`.
 *
 * NOT LABELLED "Terapeuta", which is what /profile's card says. That label is
 * true there and would be a claim here: the one relationship the schema can
 * hold is `patient.specjalist`, and nothing says whether the person in it is a
 * psychotherapist, a dietitian or a psychodietitian —
 * `specjalist.specjalization` is free text with no vocabulary behind it. So
 * the card names the person and prints the specialization only when the column
 * actually holds one.
 */
function CareCard() {
  // §13's card names the **psychodietitian**, which is a different person from
  // the therapist /profile names — and a question that could not be asked at
  // all before migration 0022, when one column held both.
  const { data, loading, failed, retry } = useAccountProfile(MODULE_DIET)

  return (
    <section className="diet-profile-card" aria-labelledby="diet-profile-care">
      <h2 id="diet-profile-care">Specjalista</h2>
      <p className="diet-profile-card-lead">
        Osoba, która prowadzi Twoje konto w Mediculusie.
      </p>

      {loading && (
        <p className="diet-profile-loading" role="status">
          Wczytywanie…
        </p>
      )}

      {/* Said out loud rather than drawn as "brak specjalisty": a failed
          request and an unassigned account are different facts, and rendering
          the absence silently would turn the first into the second. */}
      {!loading && failed && (
        <LoadError
          message={CARE_LOAD_ERROR}
          onRetry={retry}
          className="diet-profile-error"
        />
      )}

      {!loading && !failed && data?.care && (
        <>
          <p className="diet-profile-care-name">{data.care.specialist}</p>
          {/* Only when the column holds something. An empty detail line under a
              name reads as a missing job title rather than an unfilled one. */}
          {data.care.approach && (
            <p className="diet-profile-care-detail">{data.care.approach}</p>
          )}
        </>
      )}

      {!loading && !failed && data !== null && data.care === null && (
        <p className="diet-profile-care-empty">
          Nie masz jeszcze przypisanego specjalisty. Kiedy specjalista wyśle
          zaproszenie, zobaczysz je na stronie głównej — po Twoim potwierdzeniu
          pojawi się tutaj.
        </p>
      )}

      {/* An account with no `patient` row is answered 403 by the endpoint, so
          `useAccountProfile` never asks for it and leaves `data` null without
          ever being "loading" or "failed". RequireAuth's defaults keep a
          guardian and a specialist off this screen entirely, so in practice
          this branch is for the odd account that is neither — and it says the
          one true thing rather than drawing an empty card. */}
      {!loading && !failed && data === null && (
        <p className="diet-profile-care-empty">
          To konto nie prowadzi dzienniczka, więc nie ma przypisanego specjalisty.
        </p>
      )}
    </section>
  )
}

function DietProfile() {
  const { user } = useAuth()
  const signOutAndLeave = useSignOut()
  const [view, setView] = useState<ProfileView>({ kind: 'profile' })

  /**
   * The health fields.
   *
   * `emptyHealthProfile()` is the starting value rather than the answer: it is
   * what the form holds for the moment before the first response arrives, and
   * the effect below replaces it with what the server has. It is never what a
   * *failed* load settles on — see the paragraph at the top of this file.
   */
  const [draft, setDraft] = useState<HealthProfileDraft>(emptyHealthProfile)
  const [ownCondition, setOwnCondition] = useState('')
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by "Spróbuj ponownie" — the same re-run key `useAccountProfile`
   *  uses, so both halves of this screen retry the same way. */
  const [attempt, setAttempt] = useState(0)

  /**
   * The load, and the failure it is not allowed to swallow.
   *
   * The alternative to this `.catch` is a screen that answers a dropped
   * connection with an empty profile and invites somebody to fill their
   * allergies in over the top of the ones the server still holds. A profile
   * that is genuinely empty and one that could not be fetched look identical on
   * a form, so the difference has to be carried by a branch rather than by what
   * the fields happen to show.
   */
  useEffect(() => {
    let cancelled = false

    fetchHealthProfile()
      .then((loaded) => {
        if (!cancelled) setDraft(loaded)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          // The server's own sentence first, this screen's only as a fallback —
          // the convention DietSleepPanel, DietActivityPanel and every loading
          // screen in the module follow.
          setLoadError(
            (cause instanceof ApiError && cause.formMessage) || HEALTH_LOAD_ERROR,
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  /** Asks again. The two flags are reset here rather than at the top of the
   *  effect, which is `useAccountProfile.retry`'s own shape: a `setState` run
   *  synchronously inside an effect is a second render for nothing, and on the
   *  first mount it would be setting the state it already holds. */
  function retryLoad() {
    setLoading(true)
    setLoadError(null)
    setAttempt((n) => n + 1)
  }

  // The confirmations share this screen's path, so RouteChange's scroll-to-top
  // does not fire for them — the same hand-rolled reset pages/Profile.tsx needs.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  // RequireAuth guarantees a user by the time this renders; the guard is for
  // the type, and drawing nothing beats drawing a profile full of blanks.
  if (!user) return null

  const backToProfile = () => setView({ kind: 'profile' })

  if (view.kind === 'closure') {
    return (
      <AccountClosureConfirm
        reason={view.reason}
        onBack={backToProfile}
        moduleLabel={MODULE_LABEL}
      />
    )
  }
  if (view.kind === 'services-consent') {
    return (
      <ServicesConsentWithdrawal onBack={backToProfile} moduleLabel={MODULE_LABEL} />
    )
  }

  function set<K extends keyof HealthProfileDraft>(
    key: K,
    value: HealthProfileDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
    // The notice describes the last submit, and the moment anything changes it
    // is describing something else.
    setSave({ kind: 'idle' })
  }

  function toggleCondition(id: ConditionId) {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.includes(id)
        ? current.conditions.filter((entry) => entry !== id)
        : [...current.conditions, id],
    }))
    setSave({ kind: 'idle' })
  }

  /**
   * Picking the activity level again clears it.
   *
   * Three chips and no fourth for "nie wiem": unpicking is how somebody takes
   * the answer back, and without it a mis-tap would be permanent. An untouched
   * control stays null and never guesses — CLAUDE.md's own rule for the app,
   * and on a question about somebody's body the wrong default is the app
   * answering for them.
   */
  function toggleActivity(level: ActivityLevel) {
    set('activityLevel', draft.activityLevel === level ? null : level)
  }

  function addOwnCondition() {
    const entry = ownCondition.trim()
    if (entry === '') return
    setDraft((current) => ({
      ...current,
      ownConditions: [...current.ownConditions, entry],
    }))
    setOwnCondition('')
    setSave({ kind: 'idle' })
  }

  function removeOwnCondition(index: number) {
    setDraft((current) => ({
      ...current,
      ownConditions: current.ownConditions.filter((_, at) => at !== index),
    }))
    setSave({ kind: 'idle' })
  }

  /**
   * Saving.
   *
   * Nothing on this form can block it — no required field, no asterisk, no
   * validation gate. That is §05's rule for the whole module ("Żadne pole nie
   * blokuje zapisu") and it holds here: a profile filled in halfway is better
   * than one nobody dared start.
   *
   * A FAILURE IS SAID RATHER THAN SWALLOWED. The rejection used to be
   * re-thrown from inside the `.catch`, which produces a rejected promise
   * nothing handles: no error boundary sees it, it lands in the console, and
   * the patient gets a re-enabled button and no sentence at all. A lost save
   * that looks exactly like a successful one is the failure this screen can
   * least afford, since what is lost is an allergy somebody expects their
   * dietitian to have read.
   *
   * THE FORM SETTLES ON WHAT WAS STORED, not on what was typed: the response is
   * the saved profile, so trimmed text and a condition order normalised to
   * §13's arrive back here rather than waiting for the next reload to appear.
   * The same thing `DietSleepPanel` does with its night, and for the same
   * reason — a form still showing its own draft can disagree with the record it
   * just wrote. A failed save keeps the draft instead: losing answers somebody
   * just typed because the network dropped would be the worse outcome by far.
   */
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSave({ kind: 'saving' })
    saveHealthProfile(toHealthProfileInput(draft))
      .then((stored) => {
        setDraft(stored)
        setSave({ kind: 'saved' })
      })
      .catch((cause: unknown) => {
        setSave({
          kind: 'failed',
          message: (cause instanceof ApiError && cause.formMessage) || HEALTH_SAVE_ERROR,
        })
      })
  }

  const name = fullName(user.firstName, user.lastName)
  // Read-only and derived: `date_of_birth` is read-only on the serializer, so an
  // editable age would be a second source of truth for a number the server
  // already knows. Absent rather than guessed when there is no date.
  const age = user.dateOfBirth === null ? null : ageFromDateOfBirth(user.dateOfBirth)

  return (
    <div className="diet-profile-page">
      <header className="diet-profile-header">
        <Link
          className="diet-profile-back"
          to={ROUTES.diet}
          aria-label="Wróć do strony głównej modułu dietetycznego"
        >
          ←
        </Link>
        <div className="diet-profile-header-titles">
          <p className="diet-profile-module-label">{MODULE_LABEL}</p>
          <h1>Profil</h1>
        </div>
        <HeaderMenu />
      </header>

      <section className="diet-profile-card diet-profile-identity">
        <ProfileAvatar
          firstName={user.firstName}
          lastName={user.lastName}
          email={user.email}
        />
        <div className="diet-profile-identity-text">
          {/* The e-mail carries the heading when the account has no name,
              rather than an empty line where a name should be. */}
          <h2>{name ?? user.email}</h2>
          {name && user.email && (
            <p className="diet-profile-identity-email">{user.email}</p>
          )}
          {user.role && (
            <p className="diet-profile-identity-role">{roleLabel(user.role)}</p>
          )}
        </div>
      </section>

      {/* A quiet line rather than a skeleton of the fields it is waiting for:
          a greyed-out height box is still a height box with nothing in it, and
          this screen may not draw an unanswered field it has not confirmed is
          unanswered. Named separately from the specialist card's "Wczytywanie…"
          so the two are distinguishable to a reader and to a test. */}
      {loading && (
        <section className="diet-profile-card">
          <p className="diet-profile-loading" role="status">
            Wczytywanie profilu…
          </p>
        </section>
      )}

      {/* **A FAILED LOAD REPLACES THE FIELDS RATHER THAN STANDING BESIDE
          THEM.** Beside them, the blank boxes would still be inviting somebody
          to fill their allergies in — over answers the server may well be
          holding. CLAUDE.md's rule, and the same shape `CareCard` uses below:
          said out loud, with something to press. */}
      {!loading && loadError && (
        <LoadError
          message={loadError}
          onRetry={retryLoad}
          className="diet-profile-health-error"
        />
      )}

      {!loading && !loadError && (
        <form className="diet-profile-form" onSubmit={onSubmit}>
          <section
            className="diet-profile-card"
            aria-labelledby="diet-profile-basics"
          >
            <h2 id="diet-profile-basics">Dane podstawowe</h2>
            <p className="diet-profile-card-lead">
              Te informacje widzi specjalista prowadzący. Nic tutaj nie jest
              wymagane — możesz wypełnić tyle, ile chcesz.
            </p>

            <div className="diet-profile-stack">
              {/* No date of birth, no age row: a computed age with nothing to
                  compute from would be a blank pretending to be a value. */}
              {age !== null && (
                <div className="diet-profile-readonly-row">
                  <span className="diet-profile-readonly-label">Wiek</span>
                  {/* "32 lat" is a misdeclined sentence about the reader's own
                      age; Polish wants "32 lata". The same helper shape as
                      pluralGlasses (utils/drinks.ts) and pluralItems. */}
                  <span className="diet-profile-readonly-value">
                    {age} {pluralYears(age)}
                  </span>
                </div>
              )}

              <div className="diet-profile-field-row">
                <MeasurementField
                  id="diet-profile-height"
                  label="Wzrost"
                  unit="cm"
                  value={draft.heightCm}
                  hint="W centymetrach."
                  onChange={(next) => set('heightCm', next)}
                />
              </div>

              {/*
                MASS AND TARGET MASS, SIDE BY SIDE AND NOTHING BETWEEN THEM.

                Two ordinary fields in one row, in the artboard's order, neither
                marked out from the other. What is deliberately absent between them
                is the whole feature §13 forbids: no progress bar, no "zostało X
                kg", no subtraction, no arrow, no chart, no history, no BMI and no
                comment on either value.

                It is also the reason they are a *row* rather than a stack: one
                above the other reads as "jest / ma być", which is a goal with a
                distance to it even when nothing draws the distance. §13's own
                words — "te dwie liczby są danymi dla specjalisty, nie celem
                pokazywanym codziennie" — and the A set adds that visualising the
                gap "działa u nich jak wyzwalacz, nie jak motywacja".
              */}
              <div className="diet-profile-field-row">
                <MeasurementField
                  id="diet-profile-weight"
                  label="Masa ciała"
                  unit="kg"
                  value={draft.weightKg}
                  hint="W kilogramach."
                  onChange={(next) => set('weightKg', next)}
                />
                <MeasurementField
                  id="diet-profile-target-weight"
                  label="Masa docelowa"
                  unit="kg"
                  value={draft.targetWeightKg}
                  hint="W kilogramach."
                  onChange={(next) => set('targetWeightKg', next)}
                />
              </div>

              <fieldset className="diet-profile-group">
                <legend>Poziom aktywności fizycznej</legend>
                <div className="diet-profile-chip-row">
                  {ACTIVITY_LEVELS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      pressed={draft.activityLevel === option.value}
                      onToggle={() => toggleActivity(option.value)}
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <section
            className="diet-profile-card"
            aria-labelledby="diet-profile-eating"
          >
            <h2 id="diet-profile-eating">Żywienie</h2>
            {/*
              THREE DESCRIPTIVE FIELDS, NOT CHIPS, and this is a deliberate
              departure from what the artboard *draws*. §13's own note says
              "Pola opisowe, nie słownikowe — pacjentka wpisuje własnymi
              słowami", and the same page draws preferences as a fixed row of
              chips. The sentence wins over the picture: a closed list leaves
              somebody allergic to something that is not on it with nowhere to
              write it down, and an allergy nobody could record is the one
              failure this section cannot afford.
            */}
            <p className="diet-profile-card-lead">
            </p>

            <div className="diet-profile-stack">
              <DescriptiveField
                id="diet-profile-allergies"
                label="Alergie pokarmowe"
                hint=""
                value={draft.allergies}
                onChange={(next) => set('allergies', next)}
              />
              <DescriptiveField
                id="diet-profile-intolerances"
                label="Nietolerancje"
                hint=""
                value={draft.intolerances}
                onChange={(next) => set('intolerances', next)}
              />
              <DescriptiveField
                id="diet-profile-preferences"
                label="Preferencje żywieniowe"
                hint=""
                value={draft.dietaryPreferences}
                onChange={(next) => set('dietaryPreferences', next)}
              />
            </div>
          </section>

          <section
            className="diet-profile-card"
            aria-labelledby="diet-profile-conditions"
          >
            <h2 id="diet-profile-conditions">Jednostki chorobowe</h2>
            <p className="diet-profile-card-lead">
            </p>

            <div className="diet-profile-stack">
              <fieldset className="diet-profile-group">
                <legend className="visually-hidden">Jednostki chorobowe z listy</legend>
                <div className="diet-profile-chip-row">
                  {CONDITIONS.map((condition) => (
                    <Chip
                      key={condition.id}
                      label={condition.label}
                      pressed={draft.conditions.includes(condition.id)}
                      onToggle={() => toggleCondition(condition.id)}
                    />
                  ))}
                </div>
              </fieldset>

              {draft.ownConditions.length > 0 && (
                <ul className="diet-profile-own-list" aria-label="Dopisane jednostki chorobowe">
                  {draft.ownConditions.map((entry, index) => (
                    <li key={`${entry}-${index}`} className="diet-profile-own-item">
                      {entry}
                      <button
                        type="button"
                        className="diet-profile-own-remove"
                        aria-label={`Usuń „${entry}”`}
                        onClick={() => removeOwnCondition(index)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="diet-profile-own-add">
                {/* A visible label, not a placeholder: a placeholder disappears the
                    moment somebody starts typing, which is exactly when they might
                    need to check what the box was for. */}
                <div className="diet-profile-field">
                  <label htmlFor="diet-profile-own-condition">Własna jednostka chorobowa</label>
                  <input
                    id="diet-profile-own-condition"
                    type="text"
                    value={ownCondition}
                    onChange={(event) => setOwnCondition(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter adds the entry instead of submitting the whole form,
                      // which is what a single-line input inside a <form> does by
                      // default and would be a surprising way to "save".
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addOwnCondition()
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="diet-profile-own-button"
                  disabled={ownCondition.trim() === ''}
                  onClick={addOwnCondition}
                >
                  + Dodaj własną
                </button>
              </div>
            </div>
          </section>

          <button
            type="submit"
            className="diet-profile-save"
            disabled={save.kind === 'saving'}
          >
            Zapisz profil
          </button>

          {/* role="status" and not "alert": nothing failed and nothing is
              urgent. It is cleared by the next change to any field — see
              `set` — so it always describes the form as it stands. */}
          {save.kind === 'saved' && (
            <p className="diet-profile-saved" role="status">
              Zapisano.
            </p>
          )}

          {/* A save that was sent and lost. role="alert" and not "status",
              because this one *is* urgent: without it the re-enabled button is
              the only thing the reader has to go on, and it looks identical to a
              save that worked. Ochre rather than red — see dietProfile.css. */}
          {save.kind === 'failed' && (
            <p
              className="diet-profile-health-error diet-profile-save-error"
              role="alert"
            >
              {save.message}
            </p>
          )}
        </form>
      )}

      <CareCard />

      {/* The same component as /profile, not a copy — see the header. */}
      <ProfileDataRights
        user={user}
        onOpenClosure={(reason) => setView({ kind: 'closure', reason })}
        onOpenServicesWithdrawal={() => setView({ kind: 'services-consent' })}
      />

      <CollapsibleCard title="Zmień adres e-mail">
        <ProfileEmailForm currentEmail={user.email} />
      </CollapsibleCard>

      <CollapsibleCard title="Zmień hasło">
        <ProfilePasswordForm />
      </CollapsibleCard>

      <button
        type="button"
        className="diet-profile-signout"
        onClick={() => void signOutAndLeave()}
      >
        Wyloguj
      </button>
    </div>
  )
}

export default DietProfile
