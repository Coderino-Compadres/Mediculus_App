import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import { fetchDietJournalDay } from '../api/diet'
import { fromIsoDate, toIsoDate } from '../utils/days'
import { mealHeading, pluralMeals } from '../utils/meals'
import type { DietJournalDay as DietDayRecord, DietMeal } from '../types/diet'
import { ROUTES } from '../routes'
import './dietJournalDay.css'

/**
 * One day of "Historia dzienniczków żywieniowych", opened out.
 *
 * WHY IT EXISTS. §07's list carries a day's meals inline, which is right for a
 * list and runs out at exactly the day worth opening: six meals, each
 * described in a sentence or two, is a wall of text inside a card that also
 * has to show six other days. `DietJournals.tsx` said so in its header — "a
 * detail screen for one day is not built and its URL is not invented here" —
 * and this is that screen, built when it was asked for rather than guessed at
 * earlier.
 *
 * **ITS LAYOUT IS NOT FROM THE MOCKUPS.** §07's artboard is in the part of the
 * document the Claude Design viewer would not scroll to, and whether it has a
 * detail at all is unknown. What is below follows this module's own rules and
 * the shape `pages/JournalDetail.tsx` gives the psychotherapy diary; replace
 * it from §07 rather than refining it from here.
 *
 * READ-ONLY, and structurally so — there is no write verb on
 * `/api/diet/days/<date>/`. That is §07's rule about an archived day, and it
 * holds for *today* as well on this screen: today is edited on the module's
 * home screen, which is where its meals already are with their "Edytuj" and
 * "Usuń". A second place to correct a meal would be a second set of rules
 * about correcting one. The screen says which of the two a reader is looking
 * at and links to the other.
 *
 * NOTHING HERE MEASURES OR JUDGES A MEAL. §04 states the module's scope — no
 * product search, no portion, no weight, no calorie count — and this is the
 * one screen that shows a single day at full length, which makes it the
 * natural place for somebody to add a daily total. `DietJournalDay.test.tsx`
 * sweeps for each.
 */

const LOAD_ERROR = 'Nie udało się wczytać dzienniczka.'

/**
 * Said when the server answers 404.
 *
 * The history lists exactly the days that hold a meal, so any other date names
 * nothing — a typed URL, or a day whose last meal was deleted while this link
 * sat in a tab. Worded as an absence rather than as a failure, and carefully
 * not as "nie masz wpisów": it is a statement about one day, not about the
 * diary.
 */
const NOT_FOUND = 'Na ten dzień nie ma zapisanych posiłków.'

/** "wtorek, 8 września" — the weekday included, the month lowercase, as
 *  Polish spells it. Deliberately not `text-transform: capitalize`. */
function dayLabel(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function MealRow({ meal }: { meal: DietMeal }) {
  const heading = mealHeading(meal)
  const description = meal.description.trim()

  return (
    <li className="diet-day-meal">
      {heading && <p className="diet-day-meal-heading">{heading}</p>}
      {/* Said plainly rather than left blank: a meal saved without a
          description is a legitimate entry (§05), and an empty row would read
          as something that failed to load. */}
      <p className={description ? 'diet-day-meal-text' : 'diet-day-meal-text-empty'}>
        {description || 'Zapisany bez opisu.'}
      </p>
    </li>
  )
}

function DietJournalDay() {
  const { date = '' } = useParams<{ date: string }>()
  const [day, setDay] = useState<DietDayRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Told apart from a failure: a 404 is an answer, not a fault, and it must
   *  not offer "Spróbuj ponownie" — the day will not appear on a retry. */
  const [missing, setMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)

  /** Whether this is today, which is the only day the module lets anybody
   *  change — and it is changed somewhere else. Compared as ISO strings in the
   *  reader's own calendar day (`utils/days.ts`), never as `Date` objects. */
  const isToday = date === toIsoDate(new Date())

  // The house pattern: a promise chain with a `cancelled` flag rather than an
  // `async` effect body.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMissing(false)
    setLoadError(null)

    fetchDietJournalDay(date)
      .then((loaded) => {
        if (!cancelled) setDay(loaded)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 404) {
          setMissing(true)
          return
        }
        // The server's own sentence when it gave one: every refusal a patient
        // can actually reach here is a gate (an unlinked minor, withdrawn
        // consents), and each arrives saying what to do about it.
        setLoadError((cause instanceof ApiError && cause.message) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [date, attempt])

  return (
    <div className="diet-day-page">
      <header className="diet-day-header">
        <Link
          className="diet-day-back"
          to={ROUTES.dietJournals}
          aria-label="Wróć do dzienniczków żywieniowych"
        >
          ←
        </Link>
        <div className="diet-day-header-titles">
          <p className="diet-day-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>{day ? dayLabel(day.date) : 'Dzienniczek dnia'}</h1>
        </div>
        <HeaderMenu />
      </header>

      {loading && (
        <p className="diet-day-status" role="status" aria-busy="true">
          Wczytywanie dzienniczka…
        </p>
      )}

      {/* A failure is said as one. Rendering the empty state here would tell a
          patient the day is empty when it is only unreachable. */}
      {!loading && loadError && (
        <LoadError
          className="diet-day-status diet-day-status-error"
          message={loadError}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}

      {/* No retry: the day will not appear on a second attempt. */}
      {!loading && !loadError && missing && (
        <section className="diet-day-empty">
          <h2>Pusty dzień</h2>
          <p>{NOT_FOUND}</p>
          <Link className="diet-day-empty-link" to={ROUTES.dietJournals}>
            Wróć do listy dni
          </Link>
        </section>
      )}

      {!loading && !loadError && !missing && day && (
        <>
          <p className="diet-day-count">{pluralMeals(day.meals.length)}</p>

          {isToday ? (
            /* Today is editable, but not here — its meals are on the home
               screen with their own "Edytuj" and "Usuń". Said rather than
               hidden: a reader who came to correct something has to be told
               where to go, not left looking for a button. */
            <p className="diet-day-note">
              To dzisiejszy dzienniczek.{' '}
              <Link to={ROUTES.diet}>Posiłki z dzisiaj poprawisz na stronie głównej.</Link>
            </p>
          ) : (
            <p className="diet-day-note">
              <span className="diet-day-readonly-badge">Tylko odczyt</span>
              Dzień jest już zamknięty — poprawiać można wyłącznie dzisiejsze posiłki.
            </p>
          )}

          <section className="diet-day-card" aria-labelledby="diet-day-meals-heading">
            <h2 id="diet-day-meals-heading" className="visually-hidden">
              Posiłki tego dnia
            </h2>
            <ul className="diet-day-meals">
              {day.meals.map((meal) => (
                <MealRow key={meal.id} meal={meal} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

export default DietJournalDay
