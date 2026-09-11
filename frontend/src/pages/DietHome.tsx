import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import HeaderMenu from '../components/HeaderMenu'
import { deleteMeal, emptyDietDay, fetchDietDay, fetchHydration } from '../api/diet'
import { ApiError } from '../api/client'
import { APP_DISCLAIMER } from '../utils/disclaimer'
import { formatGlasses, pluralGlasses } from '../utils/drinks'
import { mealHeading, pluralMeals } from '../utils/meals'
import type { DietDay, DietMeal, HydrationDay } from '../types/diet'
import { dietMealEditPath, ROUTES } from '../routes'
import './dietHome.css'

/**
 * "Dietetyka i psychodietetyka — Strona główna", from the mockups
 * (`Makiety modułu dietetycznego`, §02; the artboard shared as `Ekran.dc.html`).
 *
 * WHAT THE MODULE IS, in the mockups' own words: "dzienniczek żywieniowy, który
 * nie liczy jedzenia — opisuje je i to, co dzieje się wokół niego". That single
 * sentence is what makes this screen look the way it does. There is no calorie
 * total, no macro ring, no product search and no numeric field anywhere on it,
 * and none of those is missing by accident — §04 of the mockups says the scope
 * out loud. Do not "complete" this screen with them.
 *
 * BOTH STATES ARE REAL NOW. §02 is titled "dwa stany dnia", and until
 * `diet_meal` existed only the first one could be: nothing wrote a meal, so
 * `emptyDietDay()` was the true answer rather than a placeholder. The screen
 * reads `GET /api/diet/today/` — the meal count and the food diary's own streak
 * — so a patient with meals written meets `StartedDayCard`. What that card
 * *looks* like is still not from the mockups: its artboard is in the part of
 * the document the canvas viewer would not scroll to, so it says the one thing
 * a meal count supports and no more (see the note on it).
 *
 * IT REUSES THE PSYCHOTHERAPY MODULE WHERE THE MOCKUP DOES. The header, the
 * greeting block with its streak and the closing disclaimer are the same shapes
 * as `pages/Home.tsx`, because the mockup draws them the same — a patient
 * crossing between modules should not feel they changed product. What it does
 * *not* do is borrow `home.css`: dressing one screen in another's classes is the
 * mistake the specialist panel was built with and `styles/panel.css` exists to
 * undo. The shared layer is `styles/theme.css`, and everything below reads its
 * tokens.
 */

/** Two lines the mockup writes as one paragraph; kept verbatim. */
const EMPTY_DAY_LEAD =
  'Zapisz posiłek wtedy, kiedy masz na to chwilę. Nie musisz opisywać całego dnia naraz.'

/**
 * The "Jak się dziś jadło?" card before there is anything to summarise.
 *
 * It is on the empty screen on purpose — the mockup keeps it visible and says
 * what will fill it, rather than hiding the section until it has content. A card
 * that appears only on days that went well would make its own absence a verdict.
 */
const DAY_SUMMARY_EMPTY =
  'To miejsce wypełni się samo, kiedy zapiszesz pierwszy posiłek z opisem samopoczucia.'

function TodayCard({
  day,
  onChanged,
}: {
  day: DietDay
  onChanged: (day: DietDay) => void
}) {
  const navigate = useNavigate()

  if (day.mealCount > 0) return <StartedDayCard day={day} onChanged={onChanged} />

  return (
    <section className="diet-card diet-today" aria-labelledby="diet-today-heading">
      <p className="diet-eyebrow">DZISIEJSZY DZIENNICZEK</p>
      <h2 id="diet-today-heading">Jeszcze pusty</h2>
      <p className="diet-today-lead">{EMPTY_DAY_LEAD}</p>
      <button
        type="button"
        className="diet-primary-button"
        onClick={() => navigate(ROUTES.dietMeal)}
      >
        Dodaj posiłek
      </button>
    </section>
  )
}

const DELETE_ERROR = 'Nie udało się usunąć posiłku.'

/**
 * One of today's meals, with the two things that can be done to it.
 *
 * DELETING ASKS TWICE, the same two-step `DietSupplements` uses and for the
 * same reason: this is a phone, the button sits under a thumb, and there is no
 * undo — a deleted meal has to be typed again. Editing does not ask, because
 * the form it opens is itself the confirmation and "Anuluj" leads back.
 *
 * The accessible names carry the meal, because "Usuń" repeated down a list of
 * four tells a screen-reader user nothing about which one they are on. The
 * visible label stays short.
 */
function TodayMealRow({
  meal,
  busy,
  confirming,
  onAskToDelete,
  onCancelDelete,
  onDelete,
}: {
  meal: DietMeal
  busy: boolean
  confirming: boolean
  onAskToDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  const heading = mealHeading(meal)
  const description = meal.description.trim()
  /** What names this meal out loud. Falls back to its description and then to
   *  a plain word, because a meal may legitimately answer nothing at all. */
  const name = heading ?? (description || 'posiłek bez opisu')

  return (
    <li className="diet-today-meal">
      <div className="diet-today-meal-body">
        {heading && <p className="diet-today-meal-heading">{heading}</p>}
        {/* Said plainly rather than left blank — a meal saved without a
            description is an ordinary entry (§05), and an empty row would read
            as something that failed to load. */}
        <p
          className={
            description ? 'diet-today-meal-text' : 'diet-today-meal-text-empty'
          }
        >
          {description || 'Zapisany bez opisu.'}
        </p>
      </div>
      <div className="diet-today-meal-actions">
        {confirming ? (
          <>
            <span className="diet-today-confirm-text">Usunąć ten posiłek?</span>
            <button
              type="button"
              className="diet-today-quiet-button"
              disabled={busy}
              onClick={onDelete}
            >
              Tak, usuń
            </button>
            <button
              type="button"
              className="diet-today-quiet-button"
              onClick={onCancelDelete}
            >
              Nie usuwaj
            </button>
          </>
        ) : (
          <>
            {/* `aria-label` rather than a visually-hidden span: the span's
                text also matched a `getByText` for the heading it repeats, and
                its leading space is collapsed at the element boundary, so the
                name came out "EdytujObiad · 13:30" — the same wart the
                supplement list's delete button has. */}
            <Link
              className="diet-today-quiet-link"
              to={dietMealEditPath(meal.id)}
              aria-label={`Edytuj ${name}`}
            >
              Edytuj
            </Link>
            <button
              type="button"
              className="diet-today-quiet-button"
              disabled={busy}
              onClick={onAskToDelete}
              aria-label={`Usuń ${name}`}
            >
              Usuń
            </button>
          </>
        )}
      </div>
    </li>
  )
}

/**
 * The day once it holds a meal — §02's second state.
 *
 * ITS LAYOUT IS STILL NOT FROM THE MOCKUPS. §02's filled artboard is in the
 * part of the document the canvas viewer would not scroll to (it answers to no
 * scroll, drag or Present from the browser extension), so what is below is
 * built from the module's own rules rather than from the designer's screen.
 * The mockup draws an axis of meals with hours, descriptions and an emotion
 * dot; the emotion dot in particular is **not** guessed at here, because no
 * column holds one. Replace this from §02 rather than extending it.
 *
 * WHAT IT GAINED, and why it is no longer only a count: today's meals are
 * editable. A card that said "Dzisiaj zapisane: 3 posiłki" could offer no way
 * to reach the one that is wrong, so a mistyped meal stayed mistyped — the gap
 * `backend/core/meals.py` and the supplement list both argued about. The meals
 * themselves now travel on `/api/diet/today/`.
 *
 * ONLY TODAY IS HERE. Every other day is the history's, read-only, exactly as
 * §07 says an archived day is — and the backend refuses an edit to one
 * regardless of what a screen offers.
 *
 * NOTHING IN THIS LIST MEASURES OR JUDGES A MEAL: no quantity, no order
 * number, no "brakuje kolacji", no target for the day. §04 states that scope
 * and `DietHome.test.tsx` sweeps for it.
 */
function StartedDayCard({
  day,
  onChanged,
}: {
  day: DietDay
  onChanged: (day: DietDay) => void
}) {
  const navigate = useNavigate()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(meal: DietMeal) {
    if (busyId !== null) return
    setBusyId(meal.id)
    setError(null)
    try {
      // The server answers with the rebuilt day — the list, the count and the
      // streak all move when a meal goes, and a browser patching its own copy
      // is how one day ends up with two versions of itself.
      onChanged(await deleteMeal(meal.id))
      setConfirmingId(null)
    } catch (cause: unknown) {
      // The server's own sentence when it gave one: the refusals a patient can
      // actually reach here are gates (an unlinked minor, withdrawn consents)
      // and the day having rolled over since the screen was opened — each
      // arrives saying what to do about it.
      setError(cause instanceof ApiError ? cause.message : DELETE_ERROR)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="diet-card diet-today" aria-labelledby="diet-today-heading">
      <p className="diet-eyebrow">DZISIEJSZY DZIENNICZEK</p>
      <h2 id="diet-today-heading">Dzisiaj zapisane: {pluralMeals(day.mealCount)}</h2>

      <ul className="diet-today-meals">
        {day.meals.map((meal) => (
          <TodayMealRow
            key={meal.id}
            meal={meal}
            busy={busyId === meal.id}
            confirming={confirmingId === meal.id}
            onAskToDelete={() => {
              setError(null)
              setConfirmingId(meal.id)
            }}
            onCancelDelete={() => setConfirmingId(null)}
            onDelete={() => void remove(meal)}
          />
        ))}
      </ul>

      {error && (
        <p className="diet-today-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="diet-primary-button"
        onClick={() => navigate(ROUTES.dietMeal)}
      >
        Dodaj posiłek
      </button>
    </section>
  )
}

/**
 * Nawodnienie — a reading, and a way into the screen that writes it.
 *
 * The mockup's home shows the count and the bar and nothing to press: adding a
 * glass belongs to §08, which is a screen of its own and now exists
 * (`pages/DietHydration.tsx`). So this card still records nothing — a "+1"
 * invented here would be the fastest way to end up with two places writing the
 * same number differently — and what it gained instead is the link, because a
 * card showing a figure with no way to reach the screen behind it makes that
 * screen findable only through the menu.
 *
 * IT READS THE SAME ENDPOINT the hydration screen does, rather than a summary
 * of its own: `GET /api/diet/hydration/`, mapped by `api/diet.ts`. Two answers
 * about one day would be two answers free to disagree — the reason the profile's
 * counters are not computed a second time either.
 *
 * A FAILED LOAD SAYS NOTHING AT ALL, which is the one place this card differs
 * from every list screen in the app. Nothing on this screen depends on it — the
 * meal count above comes from its own request and the disclaimer below needs no
 * network — so a failure here must not put "Nie udało się wczytać" over a page
 * that is otherwise fine; and unlike the technique catalogue, silence omits
 * nothing a patient could act on: the hydration screen is one tap away in the
 * menu and says so itself.
 *
 * The bar is `aria-hidden`: "0 z 6 szklanek" is already on screen as text, and a
 * progressbar role next to it makes a screen reader say the same thing twice.
 */
function HydrationCard({ day }: { day: HydrationDay }) {
  return (
    <section className="diet-card diet-hydration" aria-labelledby="diet-hydration-heading">
      <div className="diet-hydration-row">
        <h2 id="diet-hydration-heading">Nawodnienie</h2>
        <p className="diet-hydration-count">
          {formatGlasses(day.glasses)} z {day.targetGlasses}{' '}
          {pluralGlasses(day.targetGlasses)}
        </p>
      </div>
      <div className="diet-hydration-track" aria-hidden="true">
        <div
          className="diet-hydration-fill"
          style={{ width: `${Math.round(day.progress * 100)}%` }}
        />
      </div>
      <Link className="diet-hydration-link" to={ROUTES.dietHydration}>
        Zapisz, co dziś pijesz
      </Link>
    </section>
  )
}

function DietHome() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? ''

  /**
   * Today's meals and the module's own streak.
   *
   * `emptyDietDay()` is the *starting* value rather than the answer: it gives
   * the screen a shape to draw while the request is in flight, so nothing here
   * branches on null. A failure leaves it in place, which is the same judgement
   * `HydrationCard` documents below — the rest of this screen is fine, and a
   * "nie udało się wczytać" over an inviting empty day would be worse than a
   * count of zero that corrects itself on the next load.
   */
  const [day, setDay] = useState<DietDay>(() => emptyDietDay())
  // The same again for the water figure. Null until it answers, and null for
  // good if it does not — see HydrationCard on why that is silence rather than
  // an error box.
  const [hydration, setHydration] = useState<HydrationDay | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDietDay()
      .then((loaded) => {
        if (!cancelled) setDay(loaded)
      })
      .catch(() => {
        /* Deliberately nothing — the empty day stays. */
      })
    fetchHydration()
      .then((loaded) => {
        if (!cancelled) setHydration(loaded)
      })
      .catch(() => {
        /* Deliberately nothing. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * "piątek, 14 sierpnia" — the weekday included, as the mockup writes it.
   *
   * Rendered lowercase, which is how `toLocaleDateString` returns it and how
   * Polish spells a month name. `home.css`, `journals.css`, `journalDetail.css`
   * and `diaryEntry.css` all put `text-transform: capitalize` on the same kind
   * of label, which turns "8 września" into "8 Września" — a real defect on
   * those screens, and one this stylesheet does not repeat.
   */
  const today = new Date().toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  /**
   * Shown once, after the edit form navigates back here having saved.
   *
   * On the arrival rather than on the form, the same shape `DietJournals` uses
   * for a newly written meal and `/home` for a diary entry: the form leaves
   * immediately, so a message on it is one nobody can read. The corrected meal
   * is in the list right below this line.
   */
  const savedMeal = Boolean(
    (useLocation().state as { savedMeal?: boolean } | null)?.savedMeal,
  )

  return (
    <div className="diet-page">
      <header className="diet-header">
        <div>
          <p className="diet-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Strona główna</h1>
        </div>
        {/* The shared menu, unchanged. §03 of the mockups ("Menu i przełączanie
            modułów") defines what a diet-module menu holds, and that artboard is
            in the unread part — so this screen keeps the patient menu it already
            has (every entry of which leads somewhere real) rather than a guess. */}
        <HeaderMenu />
      </header>

      {savedMeal && (
        <p className="diet-saved-notice" role="status">
          Zapisano zmiany w posiłku.
        </p>
      )}

      <section className="diet-welcome">
        <div>
          {/* The mockup writes "Dobry dzień, Anno". Kept as "Dzień dobry" — the
              standard Polish greeting, and the one pages/Home.tsx already uses;
              two modules greeting the same person differently would read as two
              products. Worth confirming with the client, since it is copy. */}
          <p className="diet-greeting">{firstName ? `Dzień dobry, ${firstName}` : 'Dzień dobry'}</p>
          <p className="diet-date">{today}</p>
        </div>
        <div className="diet-streak">
          <span className="diet-streak-count">{day.streakDays}</span>
          <span className="diet-streak-label">dni z rzędu</span>
        </div>
      </section>

      <TodayCard day={day} onChanged={setDay} />

      {hydration && <HydrationCard day={hydration} />}

      <section className="diet-card diet-summary" aria-labelledby="diet-summary-heading">
        <h2 id="diet-summary-heading">Jak się dziś jadło?</h2>
        <p>{DAY_SUMMARY_EMPTY}</p>
      </section>

      <section className="diet-disclaimer">
        <span className="diet-disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        {/* The shared sentence, not the mockup's. The mockup words it
            differently — "Aplikacja nie stawia diagnozy i nie zastępuje kontaktu
            ze specjalistą. Nie jest narzędziem pomocy w kryzysie — wtedy zadzwoń
            pod 112 lub 800 70 2222." — which is a second wording of the one
            sentence this app says about its own limits, on a screen next to the
            one that says the first. utils/disclaimer.ts exists precisely because
            two copies drift at the first correction.
            TODO(klientka): settle which wording stands. If it is the mockup's,
            change APP_DISCLAIMER and both screens change together; the numbers
            it names are already in data/crisisLines.ts and should be rendered
            through PhoneLink rather than typed into the sentence. */}
        <p>{APP_DISCLAIMER}</p>
      </section>
    </div>
  )
}

export default DietHome
