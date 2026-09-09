import HeaderMenu from '../components/HeaderMenu'
import Pagination from '../components/Pagination'
import { Link } from 'react-router-dom'
import { emptyDietHistory } from '../api/diet'
import { fromIsoDate } from '../utils/days'
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
 * WHAT IT BORROWS FROM THE PSYCHOTHERAPY MODULE is the shape of a list screen —
 * seven rows a page, the page in `?page=`, an empty state that invites the first
 * entry. Those are this app's conventions (`hooks/usePagination.ts`) rather than
 * a guess, and a patient crossing between modules should meet the same list.
 *
 * NOTHING OPENS FROM A ROW, deliberately. A detail screen for one day is not
 * built and its URL is not invented here; instead the day's meals are on the row
 * itself, so the screen is useful without navigating. If §07 has a detail, that
 * is where the route comes from.
 */

/** Polish counts: 1 posiłek, 2-4 posiłki, 5+ posiłków (and the teens, which are all -ów). */
function pluralMeals(count: number): string {
  const last = count % 10
  const teens = count % 100
  if (count === 1) return '1 posiłek'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return `${count} posiłki`
  return `${count} posiłków`
}

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

/**
 * "Przekąska · 16:20", or whichever half the patient answered.
 *
 * A meal that says neither is still a meal — it is described by its text, and
 * the row leads with that instead. Nothing here reads "Nieznany posiłek": the
 * app does not label an answer somebody chose not to give.
 */
function mealHeading(meal: DietMeal): string | null {
  return [meal.kind, meal.time].filter(Boolean).join(' · ') || null
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

function DietJournals() {
  const days = emptyDietHistory()
  const pages = usePagination(days)

  return (
    <div className="diet-journals-page">
      <header className="diet-journals-header">
        <div>
          <p className="diet-journals-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Dzienniczki żywieniowe</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="diet-journals-back" to={ROUTES.diet}>
        ← Wróć do strony głównej
      </Link>

      <p className="diet-journals-intro">
        Zapisane posiłki, dzień po dniu. Nic tu nie jest liczone ani oceniane —
        to zapis tego, co jadłaś lub jadłeś i co się wokół tego działo.
      </p>

      {days.length === 0 ? (
        /* An empty history is an ordinary state, not a failure, and the way out
           of it is one tap — the same offer the home screen's empty day makes. */
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
      )}

      <Pagination
        page={pages.page}
        pageCount={pages.pageCount}
        from={pages.from}
        to={pages.to}
        total={pages.total}
        onChange={pages.goTo}
        unit="dni"
      />
    </div>
  )
}

export default DietJournals
