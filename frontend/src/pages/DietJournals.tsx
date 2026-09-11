import { useEffect, useState } from 'react'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { Link, useLocation } from 'react-router-dom'
import { ApiError } from '../api/client'
import { fetchDietHistory } from '../api/diet'
import { fromIsoDate } from '../utils/days'
import { mealHeading, pluralMeals } from '../utils/meals'
import { usePagination } from '../hooks/usePagination'
import type { DietJournalDay, DietMeal } from '../types/diet'
import { ROUTES } from '../routes'
import './dietJournals.css'

/**
 * "Dzienniczki żywieniowe" — the food diary's history.
 *
 * **THE LAYOUT OF THIS SCREEN IS NOT FROM THE MOCKUPS.** §07 of
 * `Makiety modułu dietetycznego` is called "Historia dzienniczków żywieniowych"
 * and is the artboard that decides what this looks like; it is in the part of
 * the document the Claude Design viewer would not scroll to, and it was built
 * on that basis with the client's knowledge. Replace it from §07 rather than
 * refining it from here — what is below is an engineer's reading of the
 * module's own rules, not the designer's screen.
 *
 * WHAT *IS* FROM THE MOCKUPS, and what should survive the replacement:
 * - a *dzienniczek* is a day and a day holds meals (the home screen's
 *   "DZISIEJSZY DZIENNICZEK", §07's plural title), so the history is a list of
 *   days and the meals sit inside them;
 * - a meal is labelled by kind and hour — "Przekąska · 16:20" is the mockups'
 *   own formatting, taken from §05's header;
 * - a meal's content is a photo and a description, full stop (§04). There is no
 *   calorie count, no portion size and no product on this screen because there
 *   is none in the module;
 * - nothing here is required: a meal with no kind, no hour or no description is
 *   an ordinary row, because §05's rule is that no field blocks a save.
 *
 * THE WAY BACK IS AN ARROW IN THE HEADER, which is what both of the client's
 * mockup sets draw and what pages/DiaryEntry.tsx and pages/JournalDetail.tsx
 * already do. It used to be a link below the header, which left the app with two
 * different ways of going back depending on which module you were in — a
 * difference a patient crossing between them would read as two products. The
 * *structure* is now shared; the styling is still the module's own (own class
 * prefix, own stylesheet, tokens from styles/theme.css), because dressing one
 * screen in another's class names is the mistake styles/panel.css exists to
 * undo.
 *
 * It is a `<Link>` rather than a `<button>`: the arrow's *shape* is what the two
 * modules share, not its element. A button is for a back control that has to run
 * something first — pages/DiaryEntry.tsx asks about unsaved changes — and this
 * screen has nothing to run, so making it a button would drop middle-click,
 * cmd-click and "copy link address" in exchange for nothing.
 *
 * WHAT IT BORROWS FROM THE PSYCHOTHERAPY MODULE is the shape of a list screen —
 * seven rows a page, the page in `?page=`, an empty state that invites the first
 * entry. Those are this app's conventions (`hooks/usePagination.ts`) rather than
 * a guess, and a patient crossing between modules should meet the same list.
 *
 * IT READS `GET /api/diet/meals/`, which is real: the days and their meals come
 * from `diet_meal`, grouped by the server because `entry_date` is where the
 * answer to "which day is this" already lives. It used to render
 * `emptyDietHistory()` unconditionally, when nothing could write a meal — so
 * unlike then, this screen now has a loading state and a failure state, and a
 * failed load is never drawn as an empty diary (the mistake `Journals.tsx` is
 * careful about: "nie masz jeszcze wpisów" about a diary full of them).
 *
 * WHAT STILL WRITES A MEAL IS NOTHING IN THE APP. §04's form is not built — the
 * photo in it would be the first file this deployment ever stored — so the rows
 * here come from `manage.py seed_demo_diary` and `scripts/mock_data.sql`. The
 * empty state therefore still offers "Dodaj posiłek", which leads to the
 * placeholder that screen will replace.
 *
 * NOTHING OPENS FROM A ROW, deliberately. A detail screen for one day is not
 * built and its URL is not invented here; instead the day's meals are on the row
 * itself, so the screen is useful without navigating. If §07 has a detail, that
 * is where the route comes from.
 */

/** "wtorek, 8 września" — the weekday included, and the month lowercase, as
 *  Polish spells it. Deliberately not `text-transform: capitalize`; see
 *  dietJournals.css. */
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
    <li className="diet-journal-meal">
      {heading && <p className="diet-journal-meal-heading">{heading}</p>}
      {/* Said plainly rather than left blank: a meal saved without a
          description is a legitimate entry ("niepełny wpis też jest wpisem"),
          and an empty row would read as something that failed to load. */}
      <p className={description ? 'diet-journal-meal-text' : 'diet-journal-meal-text-empty'}>
        {description || 'Zapisany bez opisu.'}
      </p>
    </li>
  )
}

function DayCard({ day }: { day: DietJournalDay }) {
  return (
    <article className="diet-journal-day" aria-labelledby={`diet-day-${day.date}`}>
      <header className="diet-journal-day-header">
        <h2 id={`diet-day-${day.date}`}>{dayLabel(day.date)}</h2>
        <span className="diet-journal-day-count">{pluralMeals(day.meals.length)}</span>
      </header>
      <ul className="diet-journal-meals">
        {day.meals.map((meal) => (
          <MealRow key={meal.id} meal={meal} />
        ))}
      </ul>
    </article>
  )
}

const LOAD_ERROR = 'Nie udało się wczytać dzienniczków żywieniowych.'

function DietJournals() {
  const [days, setDays] = useState<DietJournalDay[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by "Spróbuj ponownie", which is how the effect below is re-run —
   *  the same shape Journals.tsx and the other list screens use. */
  const [attempt, setAttempt] = useState(0)
  const pages = usePagination(days)

  // The house pattern: a promise chain with a `cancelled` flag rather than an
  // `async` effect body.
  useEffect(() => {
    let cancelled = false

    fetchDietHistory()
      .then((loaded) => {
        if (cancelled) return
        setDays(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(
            (cause instanceof ApiError && cause.formMessage) || LOAD_ERROR,
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

  function retry() {
    setLoading(true)
    setLoadError(null)
    setAttempt((n) => n + 1)
  }

  /**
   * Shown once, after §04's form navigates here having written a meal.
   *
   * On the arrival rather than on the form, for the reason `/home` renders the
   * diary's confirmation: the form leaves immediately, so a message on it would
   * be one nobody can read. It rides on router state and disappears on the next
   * navigation — a reload carries none and shows nothing, which is right,
   * because by then the meal is simply in the list below.
   */
  const savedMeal = Boolean(
    (useLocation().state as { savedMeal?: boolean } | null)?.savedMeal,
  )

  return (
    <div className="diet-journals-page">
      {savedMeal && (
        <p className="diet-journals-saved-notice" role="status">
          Zapisano posiłek.
        </p>
      )}
      <header className="diet-journals-header">
        <Link
          className="diet-journals-back"
          to={ROUTES.diet}
          aria-label="Wróć do strony głównej modułu dietetycznego"
        >
          ←
        </Link>
        <div className="diet-journals-header-titles">
          <p className="diet-journals-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Dzienniczki żywieniowe</h1>
        </div>
        <HeaderMenu />
      </header>

      <p className="diet-journals-intro">
        Zapisane posiłki, dzień po dniu. Nic tu nie jest liczone ani oceniane —
        to zapis tego, co jadłaś lub jadłeś i co się wokół tego działo.
      </p>

      {loading && (
        <p className="diet-journals-status" role="status" aria-busy="true">
          Wczytywanie dzienniczków…
        </p>
      )}

      {/* A failure is said as one. Rendering the empty state here would tell a
          patient their food diary is empty when it is only unreachable. */}
      {!loading && loadError && (
        <LoadError
          className="diet-journals-status diet-journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && (
        days.length === 0 ? (
          /* An empty history is an ordinary state, not a failure, and the way
             out of it is one tap — the same offer the home screen's empty day
             makes. */
          <section className="diet-journals-empty">
            <h2>Jeszcze nic tu nie ma</h2>
            <p>
              Pierwszy zapisany posiłek pojawi się na tej liście. Możesz zapisywać je
              pojedynczo — nie musisz opisywać całego dnia naraz.
            </p>
            <Link className="diet-journals-add" to={ROUTES.dietMeal}>
              Dodaj posiłek
            </Link>
          </section>
        ) : (
          <div className="diet-journals-list">
            {pages.items.map((day) => (
              <DayCard key={day.date} day={day} />
            ))}
          </div>
        )
      )}

      {!loading && !loadError && (
        <Pagination
          page={pages.page}
          pageCount={pages.pageCount}
          from={pages.from}
          to={pages.to}
          total={pages.total}
          onChange={pages.goTo}
          unit="dni"
        />
      )}
    </div>
  )
}

export default DietJournals
