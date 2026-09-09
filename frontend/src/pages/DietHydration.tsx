import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { fetchHydration, recordDrink, removeDrink } from '../api/diet'
import { ApiError } from '../api/client'
import {
  OTHER_DRINKS,
  WATER,
  formatGlasses,
  pluralGlasses,
  weekdayLabel,
} from '../utils/drinks'
import { fromIsoDate } from '../utils/days'
import type { DrinkName } from '../utils/drinks'
import type { HydrationDay, HydrationEntry } from '../types/diet'
import { ROUTES } from '../routes'
import './dietHydration.css'

/**
 * "Nawodnienie" — §08 of `Makiety modułu dietetycznego`, artboard `screen:
 * 'water'` in the shared prototype.
 *
 * THE FIRST DIET SCREEN WITH A BACKEND. `/diet` and `/diet/journals` read
 * `api/diet.ts`'s empty shapes because nothing can write a meal yet; this one
 * reads `/api/diet/hydration/`, which is real (see `core/hydration.py`). It
 * therefore has the loading and failure states those two deliberately do not.
 *
 * THE FOUR RULES §08 STATES, and which are not open to refinement here:
 *
 *   1. **One daily goal, in glasses**, with three ways to add: "+ Szklanka"
 *      (250 ml), "+ Butelka" (500 ml) and a custom amount. The goal and both
 *      amounts arrive from the server so this file names none of them — a
 *      psychodietitian setting the goal per patient is the next step, and a
 *      screen holding its own "6" would then be showing the wrong one.
 *   2. **The goal is a point of reference, never a verdict.** "Po przekroczeniu
 *      celu pasek po prostu jest pełny. Nie ma gratulacji, serii ani komunikatu
 *      o niedoborze." So there is nothing on this screen that congratulates, no
 *      streak, and nothing that names a day as short. The bar fills and stops;
 *      the count above it still says what the day actually was.
 *   3. **Other drinks are recorded and never converted.** Tapping "Herbata"
 *      records a serving of tea and moves no water figure. The screen says so
 *      in one line rather than leaving the patient to infer it from a counter
 *      that did not move — that would read as a bug.
 *   4. **"Ostatnie 7 dni"**, water only, today last and marked.
 *
 * WHAT IS HERE AND NOT ON THE ARTBOARD is the list of today's servings, with a
 * way to take one back. The mockup draws the three add buttons and no undo,
 * which for a counter that lives on a phone is a stray tap you cannot correct —
 * and this app's own rule for the psychotherapy diary is already "today is
 * editable, everything older is not". The list applies that rule rather than
 * inventing one; the backend enforces it (a past serving answers 404).
 * Worth confirming with the client, since it adds a control to their screen.
 *
 * WHAT IS DELIBERATELY MISSING is the other half of §08, "Suplementy i leki" —
 * a list with doses, hours and start/end dates, plus silent reminders. It is a
 * screen of its own, it is marked "Etap 2" in the mockups, and the section note
 * there records an open question (whether the list of medicines is the same
 * data as the health profile's "przyjmowane leki" or a second entry). Naming it
 * on this screen would answer that in markup.
 */

/** Said once, above the chips, rather than left to be inferred from a counter
 *  that does not move — an unexplained non-response reads as a fault. */
const OTHER_DRINKS_NOTE =
  'Zapisujemy je osobno i nie przeliczamy na wodę — to zostaje decyzją specjalisty.'

const LOAD_ERROR = 'Nie udało się wczytać nawodnienia.'

/** "piątek, 14 sierpnia", as the artboard writes it. Lowercase month, which is
 *  how Polish spells one and how `toLocaleDateString` returns it. */
function dayLabel(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** "Szklanka · 250 ml", or just the drink for everything without an amount. */
function entryLabel(entry: HydrationEntry, glassMl: number, bottleMl: number): string {
  if (entry.amountMl === null) return entry.drink
  if (entry.amountMl === glassMl) return `Szklanka · ${entry.amountMl} ml`
  if (entry.amountMl === bottleMl) return `Butelka · ${entry.amountMl} ml`
  return `Woda · ${entry.amountMl} ml`
}

/** "16:20" from the moment the server recorded, in the reader's own clock. */
function entryTime(entry: HydrationEntry): string | null {
  if (!entry.at) return null
  const at = new Date(entry.at)
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

/**
 * The counter, the bar and the three ways to add a serving.
 *
 * The bar is `aria-hidden`: "4 z 6 szklanek" is already on screen as text, and a
 * progressbar role beside it makes a screen reader say the same thing twice —
 * the same decision the home screen's card made.
 */
function TodayCard({
  day,
  busy,
  onDrink,
}: {
  day: HydrationDay
  busy: boolean
  onDrink: (amountMl: number | null, drink?: DrinkName) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState('')

  const amount = Number(custom)
  const customValid =
    custom.trim() !== '' &&
    Number.isInteger(amount) &&
    amount >= day.minAmountMl &&
    amount <= day.maxAmountMl

  function submitCustom() {
    if (!customValid) return
    onDrink(amount)
    setCustom('')
    setCustomOpen(false)
  }

  return (
    <section className="hydration-card" aria-labelledby="hydration-today-heading">
      <div className="hydration-card-head">
        <h2 id="hydration-today-heading">Dzisiaj wypite</h2>
        <p className="hydration-goal">
          cel: {day.targetGlasses} {pluralGlasses(day.targetGlasses)}
        </p>
      </div>

      <p className="hydration-count">
        <span className="hydration-count-value">{formatGlasses(day.glasses)}</span>
        <span className="hydration-count-unit">
          z {day.targetGlasses} {pluralGlasses(day.targetGlasses)}
        </span>
      </p>

      <div className="hydration-track" aria-hidden="true">
        <div
          className="hydration-fill"
          style={{ width: `${Math.round(day.progress * 100)}%` }}
        />
      </div>

      <div className="hydration-actions">
        <button
          type="button"
          className="hydration-add"
          disabled={busy}
          onClick={() => onDrink(day.glassMl)}
        >
          + Szklanka
          <span className="hydration-add-note">{day.glassMl} ml</span>
        </button>
        <button
          type="button"
          className="hydration-add"
          disabled={busy}
          onClick={() => onDrink(day.bottleMl)}
        >
          + Butelka
          <span className="hydration-add-note">{day.bottleMl} ml</span>
        </button>
        <button
          type="button"
          className="hydration-add hydration-add-quiet"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          Własna
          <span className="hydration-add-note">ilość</span>
        </button>
      </div>

      {customOpen && (
        /* Not a <form>: this card already sits on a screen with other actions,
           and a nested form would make Enter in this field ambiguous. The
           button and the keydown below are the two ways to submit it. */
        <div className="hydration-custom">
          <label className="hydration-custom-label" htmlFor="hydration-custom-amount">
            Ile wypiłaś lub wypiłeś? (ml)
          </label>
          <div className="hydration-custom-row">
            <input
              id="hydration-custom-amount"
              className="hydration-custom-input"
              type="number"
              inputMode="numeric"
              min={day.minAmountMl}
              max={day.maxAmountMl}
              step={10}
              value={custom}
              autoFocus
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitCustom()
                }
              }}
            />
            <button
              type="button"
              className="hydration-custom-submit"
              disabled={busy || !customValid}
              onClick={submitCustom}
            >
              Zapisz
            </button>
          </div>
          {/* The bounds are stated rather than only enforced: a disabled button
              with no reason beside it is the failure the registration form had
              with `invitation_code`. */}
          <p className="hydration-custom-hint">
            Od {day.minAmountMl} do {day.maxAmountMl} ml.
          </p>
        </div>
      )}
    </section>
  )
}

/** The chips from the artboard. A tap records a serving; nothing is selected
 *  afterwards, because this is an act rather than a setting. */
function OtherDrinksCard({
  busy,
  onDrink,
}: {
  busy: boolean
  onDrink: (amountMl: number | null, drink?: DrinkName) => void
}) {
  return (
    <section className="hydration-card" aria-labelledby="hydration-drinks-heading">
      <h2 id="hydration-drinks-heading">Inne napoje</h2>
      <p className="hydration-note">{OTHER_DRINKS_NOTE}</p>
      <div className="hydration-chips">
        {OTHER_DRINKS.map((drink) => (
          <button
            key={drink}
            type="button"
            className="hydration-chip"
            disabled={busy}
            onClick={() => onDrink(null, drink)}
          >
            {drink}
          </button>
        ))}
      </div>
    </section>
  )
}

/** Today's servings, and the one thing on this screen that removes anything. */
function EntriesCard({
  day,
  busy,
  onRemove,
}: {
  day: HydrationDay
  busy: boolean
  onRemove: (id: string) => void
}) {
  return (
    <section className="hydration-card" aria-labelledby="hydration-entries-heading">
      <h2 id="hydration-entries-heading">Dzisiejsze wpisy</h2>
      {day.entries.length === 0 ? (
        <p className="hydration-note">Jeszcze nic dziś nie zapisałaś ani nie zapisałeś.</p>
      ) : (
        <ul className="hydration-entries">
          {day.entries.map((entry) => {
            const time = entryTime(entry)
            return (
              <li key={entry.id} className="hydration-entry">
                <span className="hydration-entry-label">
                  {entryLabel(entry, day.glassMl, day.bottleMl)}
                  {time && <span className="hydration-entry-time"> · {time}</span>}
                </span>
                <button
                  type="button"
                  className="hydration-entry-remove"
                  disabled={busy}
                  onClick={() => onRemove(entry.id)}
                >
                  Usuń
                  <span className="visually-hidden">
                    {' '}
                    wpis: {entryLabel(entry, day.glassMl, day.bottleMl)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * "Ostatnie 7 dni".
 *
 * Drawn against the goal rather than against the tallest column, which is the
 * same argument the weekly report settled for its emotion bars: relative to the
 * best day, a week of one glass a day draws exactly the same picture as a week
 * of eight. Past the goal the column is simply full — rule 2 again.
 *
 * The columns carry no accessible name of their own; the table below them is
 * what a screen reader reads, because seven bars are a shape and a list of
 * seven "date: N glasses" is the same information said properly.
 */
function WeekCard({ day }: { day: HydrationDay }) {
  const goal = day.targetGlasses || 1

  return (
    <section className="hydration-card" aria-labelledby="hydration-week-heading">
      <h2 id="hydration-week-heading">Ostatnie 7 dni</h2>
      <div className="hydration-week" aria-hidden="true">
        {day.week.map((entry) => {
          const filled = Math.min(1, entry.glasses / goal)
          const today = entry.date === day.date
          return (
            <div key={entry.date} className="hydration-week-column">
              <div className="hydration-week-bar-track">
                <div
                  className={today ? 'hydration-week-bar hydration-week-bar-today' : 'hydration-week-bar'}
                  /* A floor of 4%, so a day with nothing is a visible baseline
                     rather than a missing column somebody reads as a gap in the
                     data. */
                  style={{ height: `${Math.max(4, Math.round(filled * 100))}%` }}
                />
              </div>
              <span
                className={today ? 'hydration-week-day hydration-week-day-today' : 'hydration-week-day'}
              >
                {weekdayLabel(entry.date)}
              </span>
            </div>
          )
        })}
      </div>
      <ul className="visually-hidden">
        {day.week.map((entry) => (
          <li key={entry.date}>
            {dayLabel(entry.date)}: {formatGlasses(entry.glasses)}{' '}
            {pluralGlasses(entry.glasses)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DietHydration() {
  const [day, setDay] = useState<HydrationDay | null>(null)
  const [loading, setLoading] = useState(true)
  /** Why there is nothing to draw — the server's own sentence when it gave one.
   *  The refusals a patient can meet here are gates rather than faults (an
   *  account waiting on a guardian, one whose consents lapsed), and each of
   *  them arrives with a message saying what to do; replacing it with "nie
   *  udało się wczytać nawodnienia" would describe a failure that did not
   *  happen. Same wording rule as Journals.tsx. */
  const [loadError, setLoadError] = useState<string | null>(null)
  /** A refusal for the act just attempted — a full day, a rejected amount, a
   *  dropped connection. Separate from `loadError`, which means the screen has
   *  nothing to draw at all. */
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Bumped by "Spróbuj ponownie", which is how the effect below is re-run —
   *  the same shape Journals.tsx and the other list screens use. */
  const [attempt, setAttempt] = useState(0)

  // The house pattern: a promise chain with a `cancelled` flag rather than an
  // `async` effect body. `loading` starts true, so the first render already
  // says "Wczytywanie…" and nothing is set synchronously on the way in.
  useEffect(() => {
    let cancelled = false

    fetchHydration()
      .then((loaded) => {
        if (cancelled) return
        setDay(loaded)
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

  async function drink(amountMl: number | null, name: DrinkName = WATER) {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      // The write answers with the whole day, so nothing here adds a glass to a
      // number of its own: what is on screen is what the server holds.
      setDay(await recordDrink(amountMl, name))
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'Nie udało się zapisać.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      await removeDrink(id)
      // 204 with no body, so the day is re-read rather than patched in place.
      setDay(await fetchHydration())
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'Nie udało się usunąć wpisu.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hydration-page">
      <header className="hydration-header">
        <div>
          <p className="hydration-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Nawodnienie</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="hydration-back" to={ROUTES.diet}>
        ← Wróć do strony głównej
      </Link>

      {loading && <p className="hydration-loading">Wczytywanie…</p>}

      {loadError && (
        <LoadError
          message={loadError}
          onRetry={retry}
          className="hydration-error"
        />
      )}

      {day && !loadError && (
        <>
          <p className="hydration-date">{dayLabel(day.date)}</p>

          {actionError && (
            <p className="hydration-error" role="alert">
              {actionError}
            </p>
          )}

          <TodayCard day={day} busy={busy} onDrink={(ml, name) => void drink(ml, name)} />
          <OtherDrinksCard busy={busy} onDrink={(ml, name) => void drink(ml, name)} />
          <EntriesCard day={day} busy={busy} onRemove={(id) => void remove(id)} />
          <WeekCard day={day} />
        </>
      )}
    </div>
  )
}

export default DietHydration
