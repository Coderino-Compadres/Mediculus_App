import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { fetchHydration, recordDrink, removeDrink } from '../api/diet'
import { ApiError } from '../api/client'
import { usePagination, type Pagination as PageSlice } from '../hooks/usePagination'
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
  // THE DRINK IS CHECKED BEFORE THE AMOUNT, and it has to be: the two serving
  // names below belong to water's own buttons, and this function used to reach
  // them for anything carrying a number — which was safe only while nothing but
  // water could carry one. Now that every drink can, a 250 ml tea would have
  // been listed as "Szklanka · 250 ml", i.e. as water, on the one screen whose
  // whole rule is that other drinks are not water.
  if (entry.drink !== WATER) return `${entry.drink} · ${entry.amountMl} ml`
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

/**
 * The chips from the artboard, plus a way to name a drink they do not list.
 *
 * A tap records a serving; nothing is selected afterwards, because this is an
 * act rather than a setting.
 *
 * "+ Inny napój" is NOT on the artboard, and it is the same kind of addition as
 * the undo on the entries below: §08 draws five chips, and five chips is a list
 * of the commonest drinks rather than of everything a person drinks. Worth
 * confirming with the client, since it adds a control to their screen.
 *
 * A SERVING WITH NO SIZE GIVEN IS RECORDED AS A GLASS, for every drink here and
 * for water alike. One tap means "I drank a glass of it", which is what the
 * "+ Szklanka" button has meant all along. It is a number nobody typed, going
 * into a clinical record, so **the hint under the amount box says so** — that
 * sentence is what makes the default honest rather than invented, and the
 * default has to go if it ever does.
 *
 * NONE OF IT IS CONVERTED INTO WATER. That used to be guaranteed by there being
 * no number to convert; now every serving carries one, and the only thing
 * holding the client's rule is that the two places computing the total filter
 * on the drink. The note above the chips still says it in words, and says it
 * for the typed drink too.
 */
function OtherDrinksCard({
  busy,
  glassMl,
  maxDrinkName,
  minAmountMl,
  maxAmountMl,
  nameError,
  onDrink,
}: {
  busy: boolean
  /** Named in the hint below, because a serving with no size given is recorded
   *  as this — a number nobody typed, so the screen has to say it. */
  glassMl: number
  maxDrinkName: number
  minAmountMl: number
  maxAmountMl: number
  nameError: string | null
  /** Resolves to whether the serving was actually written. The typed-name form
   *  is the one caller that has to know: it must not clear and close over a
   *  refusal, or the message below would have nothing left to sit under. */
  onDrink: (amountMl: number | null, drink?: string) => Promise<boolean>
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [name, setName] = useState('')
  /**
   * How much, for whichever drink is tapped next. Optional, and empty is the
   * ordinary state — §05's rule that no field blocks a save, applied to a card
   * whose whole interaction used to be one tap.
   *
   * ONE INPUT FOR THE WHOLE CARD rather than one per chip: the question ("ile?")
   * is the same for all six, and six inputs would turn a row of chips into a
   * form. It is read at the moment a chip is tapped and **cleared immediately
   * afterwards** — see `pour` — because an amount that stayed would silently
   * attach itself to the next tap, which is the kind of thing somebody notices
   * a week later in their own records.
   */
  const [amount, setAmount] = useState('')

  /* Only that there is *something* to send. The rules about the name — folding
     it onto a chip, refusing water, the length — are the server's, and it
     answers them under this field. A second copy here would be a second set of
     rules free to disagree with it. */
  const nameValid = name.trim().length > 0

  /** '' is "not saying", which is a valid serving. A number outside the bounds
   *  is not sent at all, so the button says why rather than the server. */
  const typed = Number(amount)
  const amountGiven = amount.trim() !== ''
  const amountValid =
    !amountGiven ||
    (Number.isFinite(typed) && typed >= minAmountMl && typed <= maxAmountMl)
  const servingMl = amountGiven && amountValid ? typed : null

  /** Record `drink`, with whatever is in the amount box, and empty the box.
   *
   *  Cleared on every attempt rather than only on success, unlike the name: an
   *  amount is answered again in two keystrokes, while a name is not, and an
   *  amount left behind is the one that quietly rides along on the next tap. */
  async function pour(drink: string) {
    const written = await onDrink(servingMl, drink)
    setAmount('')
    return written
  }

  async function submitName() {
    if (!nameValid || !amountValid || busy) return
    // Cleared and closed on the *answer*, not on the tap. Closing optimistically
    // unmounted the input and its error the moment somebody typed "woda", so
    // the one refusal this form can produce had nowhere to be shown — the save
    // failed silently, which is the whole failure mode this screen's messages
    // exist to avoid. On a refusal the typed name stays, ready to be corrected.
    if (await pour(name.trim())) {
      setName('')
      setCustomOpen(false)
    }
  }

  return (
    <section className="hydration-card" aria-labelledby="hydration-drinks-heading">
      <h2 id="hydration-drinks-heading">Inne napoje</h2>
      <p className="hydration-note">{OTHER_DRINKS_NOTE}</p>

      {/* Above the chips, because it is read at the moment one is tapped: a
          field *under* the row would be answered after the act it belongs to.
          Optional throughout — the card's original one-tap behaviour is what
          happens when it is left empty. */}
      <div className="hydration-drink-amount">
        <label htmlFor="hydration-drink-amount">Ile? (ml, opcjonalnie)</label>
        <input
          id="hydration-drink-amount"
          className="hydration-drink-amount-input"
          type="number"
          inputMode="numeric"
          min={minAmountMl}
          max={maxAmountMl}
          step={10}
          value={amount}
          aria-invalid={amountValid ? undefined : true}
          aria-describedby="hydration-drink-amount-hint"
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      {/* The bounds are stated rather than only enforced, the same rule the
          water card's custom amount follows: a control that refuses with no
          reason beside it is the failure the registration form had. */}
      <p className="hydration-drink-amount-hint" id="hydration-drink-amount-hint">
        {amountValid
          ? `Bez podanej ilości zapisujemy szklankę (${glassMl} ml). Możesz podać swoją — od ${minAmountMl} do ${maxAmountMl} ml.`
          : `Podaj wartość od ${minAmountMl} do ${maxAmountMl} ml albo zostaw puste.`}
      </p>

      <div className="hydration-chips">
        {OTHER_DRINKS.map((drink) => (
          <button
            key={drink}
            type="button"
            className="hydration-chip"
            disabled={busy || !amountValid}
            onClick={() => void pour(drink)}
          >
            {drink}
          </button>
        ))}
        <button
          type="button"
          className="hydration-chip hydration-chip-quiet"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          + Inny napój
        </button>
      </div>

      {customOpen && (
        /* Not a <form>, for the reason "Własna ilość" is not one: this card sits
           on a screen with other actions and a nested form would make Enter
           ambiguous. The button and the keydown are the two ways to submit. */
        <div className="hydration-custom">
          <label className="hydration-custom-label" htmlFor="hydration-custom-drink">
            Co piłaś lub piłeś?
          </label>
          <div className="hydration-custom-row">
            <input
              id="hydration-custom-drink"
              className="hydration-custom-input hydration-custom-input-text"
              type="text"
              value={name}
              maxLength={maxDrinkName}
              autoFocus
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'hydration-custom-drink-error' : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submitName()
                }
              }}
            />
            <button
              type="button"
              className="hydration-custom-submit"
              disabled={busy || !nameValid || !amountValid}
              onClick={() => void submitName()}
            >
              Zapisz
            </button>
          </div>
          {/* The server's own sentence, under the input that produced it. The
              one refusal a patient can actually reach here is typing "woda",
              which is answered by pointing at the buttons that take an amount —
              putting it above the card instead would be a save that failed
              somewhere the eye is not. */}
          {nameError && (
            <p className="hydration-custom-error" id="hydration-custom-drink-error" role="alert">
              {nameError}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Today's servings, and the one thing on this screen that removes anything.
 *
 * PAGINATED at the app's usual `PAGE_SIZE` (hooks/usePagination.ts), which on
 * this list is a readability measure and nothing more: `MAX_ENTRIES_PER_DAY`
 * (40) is a backstop rather than a product rule, so most days never reach a
 * second page. The pages are only over *this* card — "Ostatnie 7 dni" below is
 * always exactly seven columns and must never gain a control of its own.
 *
 * The order is newest first (`core/hydration.py` sorts on `-created_at`), so a
 * serving that was just recorded is on page one — which is why the screen
 * resets to it after every write. Undoing a mis-tap is the whole reason this
 * list has a "Usuń" at all, and it must not be a page turn away from the tap
 * that caused it.
 */
function EntriesCard({
  day,
  pages,
  busy,
  onRemove,
}: {
  day: HydrationDay
  pages: PageSlice<HydrationEntry>
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
          {pages.items.map((entry) => {
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
      <Pagination
        page={pages.page}
        pageCount={pages.pageCount}
        from={pages.from}
        to={pages.to}
        total={pages.total}
        onChange={pages.goTo}
        unit="wpisów"
      />
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
  /** A refusal Django attributed to `drink`, so it can be shown under the input
   *  that produced it rather than above the card. Kept apart from
   *  `actionError` for exactly that reason — one message, two places, and only
   *  the field one is any use for a name the patient just typed. */
  const [drinkNameError, setDrinkNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Bumped by "Spróbuj ponownie", which is how the effect below is re-run —
   *  the same shape Journals.tsx and the other list screens use. */
  const [attempt, setAttempt] = useState(0)
  // Over today's servings only. "Ostatnie 7 dni" is always seven columns and
  // takes no page of its own — one `?page=` per screen.
  const pages = usePagination(day?.entries ?? [])

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

  /** Returns whether the serving was written — see `OtherDrinksCard.onDrink`. */
  async function drink(amountMl: number | null, name: string = WATER): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setActionError(null)
    setDrinkNameError(null)
    try {
      // The write answers with the whole day, so nothing here adds a glass to a
      // number of its own: what is on screen is what the server holds.
      setDay(await recordDrink(amountMl, name))
      // The new serving is at the top of a newest-first list, i.e. on page one,
      // and the "Usuń" beside it is how a mis-tap is taken back.
      pages.reset()
      return true
    } catch (error) {
      // A refusal about the *name* goes back to the input; anything else is a
      // message above the card. `drink` is the only field on this screen that
      // can carry one, which is why this is a lookup rather than a mapping
      // table like the supplement form's.
      const onTheName = error instanceof ApiError ? error.fieldErrors.drink : undefined
      if (onTheName) setDrinkNameError(onTheName)
      else {
        setActionError(
          error instanceof ApiError ? error.message : 'Nie udało się zapisać.',
        )
      }
      return false
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
          <OtherDrinksCard
            busy={busy}
            glassMl={day.glassMl}
            maxDrinkName={day.maxDrinkName}
            minAmountMl={day.minAmountMl}
            maxAmountMl={day.maxAmountMl}
            nameError={drinkNameError}
            onDrink={drink}
          />
          <EntriesCard
            day={day}
            pages={pages}
            busy={busy}
            onRemove={(id) => void remove(id)}
          />
          <WeekCard day={day} />
        </>
      )}
    </div>
  )
}

export default DietHydration
