import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import { createMeal } from '../api/diet'
import { ApiError } from '../api/client'
import { MEAL_KINDS } from '../utils/meals'
import { ROUTES } from '../routes'
import type { DietMealInput } from '../types/diet'
import './dietMealForm.css'

/**
 * "Dodawanie posiłku" — §04/§05 of `Makiety modułu dietetycznego`.
 *
 * THE MODULE'S PRIMARY ACTION, and until now the one that led nowhere: both the
 * home screen's button and the history's empty state pointed at a
 * `PlaceholderPage`. What held it back was a single field — §04 names a photo
 * and a description as the two sources of a meal's content, and a photo would
 * be the first file this deployment ever stored. But `diet_meal` has no photo
 * column, so everything the schema can hold was writable all along. The photo
 * is still the open question; see `backend/core/meals.py`.
 *
 * WHAT IS NOT ON THIS SCREEN, and will not be: a product search, a portion, a
 * weight, a calorie count, a macro split. §04 states that scope outright — the
 * module "nie liczy jedzenia" — and among these patients are people with eating
 * disorders, so a number entered next to a meal is exactly what it is built
 * without. `DietMealForm.test.tsx` sweeps for each of them; those are the lines
 * somebody "completes" this screen across.
 *
 * NOTHING BLOCKS A SAVE. §05 says so in as many words ("Żadne pole nie blokuje
 * zapisu — niepełny wpis jest lepszy niż brak wpisu") and it is meant literally
 * here: the button is never disabled, and a meal answering none of the three
 * questions is written. It records that a meal happened, which is itself what
 * this diary is for — `pages/DietJournals.tsx` already renders such a row as an
 * ordinary one. So there is no required-field marker anywhere on the screen and
 * no validation of its own; the only refusals it can show come from the server.
 *
 * ONE SCREEN RATHER THAN §04's TWO STEPS. The mockup splits it because the
 * second step is the photo; with the photo out, a two-step form would be one
 * question per screen for three questions. Restore the split when the photo
 * arrives rather than treating this as the finished shape.
 *
 * THE HOUR DEFAULTS TO NOW, which is the one place this screen fills something
 * in for the patient — and it is defensible only because it is *visible and
 * editable*: the field shows it, changing it is one tap, and clearing it is an
 * ordinary answer. That is the opposite of the diary's untouched sliders, which
 * wrote a 0 nobody chose because nothing on the screen said they had.
 */

const KIND_LABEL = 'Rodzaj posiłku'
const HOUR_LABEL = 'Godzina'
const HOUR_FIELD_LABEL = 'Godzina posiłku'
const DESCRIPTION_LABEL = 'Co to był za posiłek?'
const DESCRIPTION_FIELD_LABEL = 'Opis posiłku'

/** What the box asks for, in §04's own terms: the meal and what was around it. */
const DESCRIPTION_HINT =
  'Opisz własnymi słowami — co jadłaś lub jadłeś, gdzie i jak się z tym czułaś ' +
  'lub czułeś. Możesz też zostawić puste.'

/** Said once, above the form, rather than as a marker on every field. */
const NOTHING_REQUIRED = 'Nic tu nie jest wymagane. Niepełny wpis jest lepszy niż żaden.'

const SAVE_ERROR = 'Nie udało się zapisać posiłku.'

/** 'HH:MM' now, in the reader's own clock — the same shape the column holds. */
function nowHour(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function DietMealForm() {
  const navigate = useNavigate()

  const [kind, setKind] = useState<string | null>(null)
  const [time, setTime] = useState(() => nowHour())
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleKind(chosen: string) {
    // Pressing the chosen chip again takes the answer back: with no required
    // fields, "I would rather not say which" has to be reachable from the
    // control itself. Same rule as the activity panel's chips.
    setKind((current) => (current === chosen ? null : chosen))
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    const input: DietMealInput = { kind, time: time || null, description }
    try {
      await createMeal(input)
      // Straight to the history, which is where the meal now is — and it says
      // so by showing it, rather than this screen claiming a save and staying
      // put. `state` is what makes the arrival say something happened.
      navigate(ROUTES.dietJournals, { state: { savedMeal: true } })
    } catch (cause) {
      // The server's own sentence when it has one: every refusal a patient can
      // actually reach here is a gate (an unlinked minor, withdrawn consents),
      // and each arrives with a message saying what to do about it.
      setError(cause instanceof ApiError ? cause.message : SAVE_ERROR)
      setSaving(false)
    }
  }

  return (
    <div className="diet-meal-page">
      <header className="diet-meal-header">
        <Link
          className="diet-meal-back"
          to={ROUTES.diet}
          aria-label="Wróć do strony głównej modułu dietetycznego"
        >
          ←
        </Link>
        <div className="diet-meal-header-titles">
          <p className="diet-meal-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Dodawanie posiłku</h1>
        </div>
        <HeaderMenu />
      </header>

      <p className="diet-meal-intro">{NOTHING_REQUIRED}</p>

      <section className="diet-meal-card" aria-labelledby="meal-kind-heading">
        <h2 id="meal-kind-heading">{KIND_LABEL}</h2>
        <div className="diet-meal-chip-row">
          {MEAL_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              className={
                kind === option ? 'diet-meal-chip diet-meal-chip-selected' : 'diet-meal-chip'
              }
              aria-pressed={kind === option}
              onClick={() => toggleKind(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <section className="diet-meal-card" aria-labelledby="meal-hour-heading">
        <h2 id="meal-hour-heading">{HOUR_LABEL}</h2>
        <div className="diet-meal-field diet-meal-field-inline">
          {/* Visually hidden: the card's own <h2> already says "Godzina", and a
              second visible copy gave the section and the input one accessible
              name between them. The name here is the longer one for the same
              reason — a control and its container must not answer to the
              same string. */}
          <label className="visually-hidden" htmlFor="meal-time">
            {HOUR_FIELD_LABEL}
          </label>
          <input
            id="meal-time"
            type="time"
            className="diet-meal-time-input"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        <p className="diet-meal-hint">
          Wpisana jest bieżąca godzina — możesz ją zmienić albo wyczyścić.
        </p>
      </section>

      <section className="diet-meal-card" aria-labelledby="meal-description-heading">
        <h2 id="meal-description-heading">{DESCRIPTION_LABEL}</h2>
        <div className="diet-meal-field">
          {/* Distinct from the card's <h2>, which asks the question. Sharing
              the string would give the section and the textarea one accessible
              name between them — the same trap as the hour above. */}
          <label className="visually-hidden" htmlFor="meal-description">
            {DESCRIPTION_FIELD_LABEL}
          </label>
          <textarea
            id="meal-description"
            className="diet-meal-textarea"
            rows={5}
            value={description}
            aria-describedby="meal-description-hint"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <p className="diet-meal-hint" id="meal-description-hint">
          {DESCRIPTION_HINT}
        </p>
      </section>

      {error && (
        <p className="diet-meal-error" role="alert">
          {error}
        </p>
      )}

      <div className="diet-meal-actions">
        <button
          type="button"
          className="diet-meal-submit"
          // Never disabled by the form's own state — nothing is required. It is
          // disabled only while a request is in flight, so a double tap is one
          // meal rather than two.
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz posiłek'}
        </button>
        <Link className="diet-meal-cancel" to={ROUTES.diet}>
          Anuluj
        </Link>
      </div>
    </div>
  )
}

export default DietMealForm
