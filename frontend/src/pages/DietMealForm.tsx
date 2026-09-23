import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EmotionSelector from '../components/EmotionSelector'
import HeaderMenu from '../components/HeaderMenu'
import TimeField from '../components/TimeField'
import { createMeal, fetchDietDay, updateMeal } from '../api/diet'
import { ApiError } from '../api/client'
import { MEAL_KINDS } from '../utils/meals'
import { ROUTES } from '../routes'
import type { EmotionName } from '../utils/emotions'
import type { EmotionEntry } from '../types/diaryEntry'
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
 * IT ASKS WHAT WAS FELT, WHICH IS THE HALF THE DIARY WAS MISSING. §04 puts the
 * psychotherapy form's emotion picker on this screen — the same ten chips, the
 * same 0-10 sliders — and §05 names the section a report would build from it
 * ("najczęstsze emocje przy jedzeniu"). Until it existed the module could say
 * what was eaten and when and nothing about what was around it, which is the
 * part it is actually for: "nie liczy jedzenia — opisuje je i to, co dzieje się
 * wokół niego". `EmotionSelector` is literally the diary's component, not a
 * copy of it, so the ten names and the scale cannot drift apart between the two
 * modules.
 *
 * A NUMBER HERE RATES A FEELING, NEVER THE FOOD, and that distinction is the
 * reason a 0-10 slider is allowed on a screen built around counting nothing.
 * The sweeps below still hold: no portion, no weight, no calorie count.
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
const EMOTIONS_LABEL = 'Co czułaś lub czułeś przy tym posiłku?'

/** What the picker asks for, and what it deliberately does not.
 *
 *  It says the sliders are optional out loud, because they are the one control
 *  on this screen that *looks* answered before it is touched: a range input has
 *  no empty position and sits at 0. What the form sends for an untouched one is
 *  null, and the reading beside it says "nie podano" until it moves. */
const EMOTIONS_HINT =
  'Zaznacz, co Ci towarzyszyło — możesz wybrać kilka emocji albo żadnej. ' +
  'Suwak siły emocji jest opcjonalny.'

/** What the box asks for, in §04's own terms: the meal and what was around it. */
const DESCRIPTION_HINT =
  'Opisz własnymi słowami — co jadłaś lub jadłeś, gdzie i jak się z tym czułaś ' +
  'lub czułeś. Możesz też zostawić puste.'

/** Said once, above the form, rather than as a marker on every field. */
const NOTHING_REQUIRED = 'Nic tu nie jest wymagane. Niepełny wpis jest lepszy niż żaden.'

const SAVE_ERROR = 'Nie udało się zapisać posiłku.'
const LOAD_ERROR = 'Nie udało się wczytać posiłku.'

/**
 * Why an edit can find nothing to edit.
 *
 * The form reads today's meals and looks the id up among them, so a miss means
 * the meal is not today's — archived, or somebody else's, which from here are
 * the same fact: not yours to correct now. Said plainly rather than as a bare
 * "404", and it offers the thing that still works.
 */
const NOT_TODAYS_MEAL =
  'Tego posiłku nie można już poprawić — edytować można tylko dzisiejsze wpisy.'

/** 'HH:MM' now, in the reader's own clock — the same shape the column holds. */
function nowHour(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function DietMealForm() {
  const navigate = useNavigate()
  /** Present on `/diet/meal/:id`, absent on `/diet/meal`. One component for
   *  both, because the rules about what a meal may hold — six kinds, an
   *  optional hour, a description that may be empty — belong in one place. A
   *  second form would be a second set of them, free to disagree. */
  const { id } = useParams<{ id: string }>()
  const editing = id !== undefined

  const [kind, setKind] = useState<string | null>(null)
  // Pre-filled with now when adding, and with the meal's own hour when
  // editing — where an unanswered hour is an empty box, not this moment.
  const [time, setTime] = useState(() => (id === undefined ? nowHour() : ''))
  const [description, setDescription] = useState('')
  /** The chips picked, each with its slider value or `null` for untouched.
   *  Order is the order they were tapped in; the server sorts by the
   *  vocabulary on the way back, so re-opening an edit redraws them in the
   *  picker's own order rather than in this one. */
  const [emotions, setEmotions] = useState<EmotionEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(editing)
  /** Set when there is nothing to edit, which hides the form: a form over a
   *  meal that cannot be saved is a form that can only fail. */
  const [loadError, setLoadError] = useState<string | null>(null)

  /**
   * Fill the form from today's meals.
   *
   * `GET /api/diet/today/` rather than an endpoint naming the meal: only
   * today's meals are editable, and today's meals are exactly what that
   * payload carries. An id that is not among them is not this patient's
   * today, which is the whole of what this screen needs to know — so the
   * module needs no `GET /api/diet/meals/<id>/` and gains no way to ask
   * whether somebody else's row exists.
   */
  useEffect(() => {
    if (id === undefined) return
    let cancelled = false

    fetchDietDay()
      .then((day) => {
        if (cancelled) return
        const meal = day.meals.find((candidate) => candidate.id === id)
        if (meal === undefined) {
          setLoadError(NOT_TODAYS_MEAL)
          return
        }
        setKind(meal.kind)
        setTime(meal.time ?? '')
        setDescription(meal.description)
        setEmotions(meal.emotions)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(cause instanceof ApiError ? cause.message : LOAD_ERROR)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  function toggleKind(chosen: string) {
    // Pressing the chosen chip again takes the answer back: with no required
    // fields, "I would rather not say which" has to be reachable from the
    // control itself. Same rule as the activity panel's chips.
    setKind((current) => (current === chosen ? null : chosen))
  }

  function toggleEmotion(emotion: EmotionName) {
    setEmotions((current) => {
      const picked = current.some((entry) => entry.emotion === emotion)
      return picked
        ? current.filter((entry) => entry.emotion !== emotion)
        // `null`, and deliberately unlike `pages/DiaryEntry.tsx`, which adds
        // the same chip with a 0. That 0 is a workaround for a schema: the
        // diary's `mood_scale` keeps one nullable column per emotion and NULL
        // there already means "never picked", so a picked-but-unrated chip has
        // nowhere to live and 0 is the least-bad stand-in — one that reads as
        // "wcale" and drags that emotion's average down. `diet_meal_emotion`
        // is a row per chip, so the picking and the rating are stored apart
        // and this form can send what CLAUDE.md asks for: an untouched slider
        // is null, not 0.
        : [...current, { emotion, intensity: null }]
    })
  }

  function setEmotionIntensity(emotion: EmotionName, intensity: number) {
    setEmotions((current) =>
      current.map((entry) =>
        entry.emotion === emotion ? { ...entry, intensity } : entry,
      ),
    )
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    const input: DietMealInput = {
      kind, time: time || null, description, emotions,
    }
    try {
      if (id === undefined) {
        await createMeal(input)
        // Straight to the history, which is where the meal now is — and it
        // says so by showing it, rather than this screen claiming a save and
        // staying put. `state` is what makes the arrival say something
        // happened.
        navigate(ROUTES.dietJournals, { state: { savedMeal: true } })
      } else {
        await updateMeal(id, input)
        // Back to the home screen, which is where the edit was started from
        // and where today's meals are listed — so the correction is visible
        // on arrival rather than asserted here.
        navigate(ROUTES.diet, { state: { savedMeal: true } })
      }
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
          <h1>{editing ? 'Edycja posiłku' : 'Dodawanie posiłku'}</h1>
        </div>
        <HeaderMenu />
      </header>

      {loading && (
        <p className="diet-meal-status" role="status" aria-busy="true">
          Wczytywanie posiłku…
        </p>
      )}

      {/* The form is not drawn at all when there is nothing to save it into:
          a form that can only fail is worse than a sentence saying why. */}
      {loadError !== null && (
        <div className="diet-meal-status diet-meal-status-error" role="alert">
          <p>{loadError}</p>
          <Link className="diet-meal-status-link" to={ROUTES.diet}>
            Wróć do strony głównej
          </Link>
        </div>
      )}

      {!loading && loadError === null && (
        <>
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
          <TimeField
            id="meal-time"
            className="diet-meal-time-input"
            value={time}
            onChange={setTime}
          />
        </div>
        <p className="diet-meal-hint">
          {editing
            ? 'Możesz zmienić godzinę albo ją wyczyścić.'
            : 'Wpisana jest bieżąca godzina — możesz ją zmienić albo wyczyścić.'}
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

      {/* The diary's own picker, not a copy of it: one component means the ten
          names, their colours and the 0-10 scale cannot come apart between the
          two modules, and §05's report reads both. Last of the four questions
          because it is the one that asks about the patient rather than about
          the meal — what was eaten is easier to start with. */}
      <section className="diet-meal-card" aria-labelledby="meal-emotions-heading">
        <h2 id="meal-emotions-heading">{EMOTIONS_LABEL}</h2>
        <EmotionSelector
          selected={emotions}
          onToggle={toggleEmotion}
          onIntensityChange={setEmotionIntensity}
          // No `alertThresholds`, unlike the diary's, and that is this module's
          // rule rather than an omission: there the 'Stres' chip carries the
          // confirmed alarm from US-PT-13, and here a "· wysokie" beside a meal
          // would be the screen judging one — exactly what §02/§05 build this
          // module without.
        />
        <p className="diet-meal-hint">{EMOTIONS_HINT}</p>
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
          {saving
            ? 'Zapisywanie…'
            : editing
              ? 'Zapisz zmiany'
              : 'Zapisz posiłek'}
        </button>
        <Link className="diet-meal-cancel" to={ROUTES.diet}>
          Anuluj
        </Link>
      </div>
        </>
      )}
    </div>
  )
}

export default DietMealForm
