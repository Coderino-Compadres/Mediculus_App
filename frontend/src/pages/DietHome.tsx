import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import HeaderMenu from '../components/HeaderMenu'
import { emptyDietDay } from '../api/diet'
import { APP_DISCLAIMER } from '../utils/disclaimer'
import type { DietDay } from '../types/diet'
import { ROUTES } from '../routes'
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
 * WHAT IS BUILT HERE is the empty day: the state a patient meets before the
 * first meal of the day, which is also — until the module has a backend — the
 * only state that can be true. See `api/diet.ts` for why the screen renders that
 * rather than asking a URL which does not exist. §02 is titled "dwa stany dnia";
 * the second one is in a part of the mockups that could not be read from the
 * canvas viewer, so it is deliberately **not** guessed at here (see the note on
 * `StartedDayCard`).
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

function TodayCard({ day }: { day: DietDay }) {
  const navigate = useNavigate()

  if (day.mealCount > 0) return <StartedDayCard day={day} />

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

/**
 * The day once it holds a meal — and deliberately the plainest thing that can
 * be true rather than a guess at the design.
 *
 * §02 of the mockups is "Strona główna modułu — dwa stany dnia" and this is the
 * second one; its artboard is in the part of the document the canvas viewer
 * would not scroll to. Nothing today can reach this branch (`emptyDietDay` is
 * the only producer of a `DietDay`), so the choice is between leaving the
 * component blind to its own data and saying the one thing the count supports.
 * It says that. Replace it from the mockup — do not extend it from here.
 */
function StartedDayCard({ day }: { day: DietDay }) {
  const navigate = useNavigate()
  const meals = day.mealCount === 1 ? '1 posiłek' : `${day.mealCount} posiłki`

  return (
    <section className="diet-card diet-today" aria-labelledby="diet-today-heading">
      <p className="diet-eyebrow">DZISIEJSZY DZIENNICZEK</p>
      <h2 id="diet-today-heading">Dzisiaj zapisane: {meals}</h2>
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
 * Nawodnienie — a reading, not a control.
 *
 * The mockup's home shows the count and the bar and nothing to press; adding a
 * glass belongs to §08 ("Nawodnienie i suplementy"), which is a screen of its
 * own. A "+1" invented here would be the fastest way to end up with two places
 * that write the same number differently.
 *
 * The bar is `aria-hidden`: "0 z 6 szklanek" is already on screen as text, and a
 * progressbar role next to it makes a screen reader say the same thing twice.
 */
function HydrationCard({ day }: { day: DietDay }) {
  const { glasses, target } = day.hydration
  const filled = target > 0 ? Math.min(100, Math.round((glasses / target) * 100)) : 0

  return (
    <section className="diet-card diet-hydration" aria-labelledby="diet-hydration-heading">
      <div className="diet-hydration-row">
        <h2 id="diet-hydration-heading">Nawodnienie</h2>
        <p className="diet-hydration-count">
          {glasses} z {target} szklanek
        </p>
      </div>
      <div className="diet-hydration-track" aria-hidden="true">
        <div className="diet-hydration-fill" style={{ width: `${filled}%` }} />
      </div>
    </section>
  )
}

function DietHome() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? ''
  const day = emptyDietDay()

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

      <TodayCard day={day} />

      <HydrationCard day={day} />

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
