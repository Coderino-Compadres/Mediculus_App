import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import {
  createSupplement,
  deleteSupplement,
  fetchSupplements,
  setSupplementTaken,
  updateSupplement,
} from '../api/diet'
import { ApiError } from '../api/client'
import { PAGE_SIZE, usePagination } from '../hooks/usePagination'
import { doseLabel, periodLabel, pluralItems, takenCount } from '../utils/supplements'
import type { Supplement, SupplementInput } from '../types/diet'
import { ROUTES } from '../routes'
import './dietSupplements.css'

/**
 * "Suplementy i leki" — the second half of §08 of `Makiety modułu
 * dietetycznego`, artboard `screen: 'supp'` in the shared prototype.
 *
 * WHAT §08 SAYS THIS IS: "lista z dawką, częstotliwością, godziną oraz datami
 * rozpoczęcia i zakończenia", with "Odhacz, kiedy weźmiesz" above it. Every one
 * of those is a column (`core/supplements.py`) and none of them is computed.
 *
 * THE ONE RULE THAT SHAPES THIS SCREEN MORE THAN THE ARTBOARD DOES is the one
 * §08 states about the water counter and which applies here with more force:
 * "Nie ma gratulacji, serii ani komunikatu o niedoborze." So there is no "2 z 3"
 * anywhere, no bar, no percentage and nothing that names a day as incomplete —
 * among these patients are people with eating disorders, and this is a screen
 * opened every morning. `takenToday` is a checkbox and nothing else, and the
 * only place a count appears at all is the list's accessible description, where
 * it says what the ticks already say visually. `DietSupplements.test.tsx` sweeps
 * for the rest.
 *
 * AN UNTICKED BOX IS NOT A MISSED DOSE. Unticking deletes the row (there is no
 * stored "not taken"), so the app holds no record that somebody skipped a
 * medicine and this screen cannot start reporting one.
 *
 * TWO THINGS DIFFER FROM THE ARTBOARD, and both are deliberate:
 *
 *   1. **The reminder switch is not a global toggle.** The artboard draws one
 *      switch for the whole screen; a reminder is per preparation (each has its
 *      own hour), so the question is asked in the form that writes one and
 *      stored on that row. The card that replaces the switch says the thing
 *      that actually matters: **this deployment sends no notifications at all** —
 *      no push, no mail — so the setting is kept and nothing fires on it yet. A
 *      switch that silently promised one would be the mistake the home screen's
 *      technique card was.
 *   2. **There is an "Edytuj" and a "Usuń".** The artboard draws only the add
 *      button, which leaves a mistyped dose on a medicine list uncorrectable.
 *      Deleting asks twice, because it takes that preparation's ticks with it
 *      and the patient cannot undo it — the same two-step `SpecialistPatients`
 *      uses for ending care.
 *
 * WHAT IS DELIBERATELY ABSENT is any link between this list and a health
 * profile. §08's own note records the open question — whether "przyjmowane
 * leki" in §13's profile is the same data or a second entry — and §13 is not
 * built, so naming it here would answer it in markup.
 *
 * THE LIST PAGINATES AT `PAGE_SIZE`, the app's own list convention
 * (hooks/usePagination.ts), and this is the one screen where that convention
 * costs something rather than only helping: it is a checklist opened every
 * morning, so a preparation on page two is a page turn away from being ticked.
 * `MAX_SUPPLEMENTS` (60) is a backstop and not a product rule, so most lists
 * will never see a second page at all. Two details are what keep the rest
 * honest:
 *
 *   - **the list is ordered by hour, so a written row can land on any page.**
 *     After a create or an edit the screen therefore turns to the page that now
 *     holds that row (`revealPageOf`) rather than resetting to page one the way
 *     the specialist panel's prepend-ordered lists do. A form that saves and
 *     then hides what it saved is the kind of silent failure this module's
 *     wording is otherwise careful about;
 *   - **the accessible description of the list still counts the whole list**,
 *     never the page. `takenCount` is restricted to that one caller on purpose
 *     (see utils/supplements.ts): a count that moved with the page would be a
 *     per-page tally, i.e. the "2 z 3" this screen exists not to show.
 */

/** Said above the list, as the artboard says it. */
const LIST_LEAD = 'Odhacz, kiedy weźmiesz.'

/** The whole of what this app can honestly say about reminders today. */
const REMINDER_NOTE =
  'Ustawienie zapisujemy razem z pozycją, ale aplikacja nie wysyła jeszcze ' +
  'żadnych powiadomień — na razie działa jak notatka o godzinie.'

const LOAD_ERROR = 'Nie udało się wczytać listy suplementów i leków.'

const EMPTY_INPUT: SupplementInput = {
  name: '',
  dose: '',
  frequency: '',
  hour: '',
  startDate: '',
  endDate: '',
  reminderEnabled: true,
}

/** An existing row as the form's own state. Sent back whole on save, because
 *  PUT replaces rather than merges. */
function toInput(supplement: Supplement): SupplementInput {
  return {
    name: supplement.name,
    dose: supplement.dose ?? '',
    frequency: supplement.frequency ?? '',
    hour: supplement.hour ?? '',
    startDate: supplement.startDate ?? '',
    endDate: supplement.endDate ?? '',
    reminderEnabled: supplement.reminderEnabled,
  }
}

/** Which field a server refusal belongs under, by the API's own column names. */
type FieldErrors = Partial<Record<keyof SupplementInput, string>>

const FIELD_BY_COLUMN: Record<string, keyof SupplementInput> = {
  name: 'name',
  dose: 'dose',
  frequency: 'frequency',
  hour: 'hour',
  start_date: 'startDate',
  end_date: 'endDate',
  reminder_enabled: 'reminderEnabled',
}

/**
 * A server verdict lands under the input that produced it.
 *
 * The one refusal this form can get is "end before start", which the backend
 * raises under `end_date` — so it has to reach the date input rather than the
 * top of the screen, the failure `Register.tsx` had with `invitation_code`.
 */
function fieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {}
  const found: FieldErrors = {}
  for (const [column, field] of Object.entries(FIELD_BY_COLUMN)) {
    const message = error.fieldErrors[column]
    if (message) found[field] = message
  }
  return found
}

/**
 * One row of the list.
 *
 * The name is a heading and the checkbox is labelled by it, so a screen reader
 * says "Witamina D3, pole wyboru" rather than reading an unnamed control. The
 * hour is a badge on the artboard and stays one; it is text, not a colour-only
 * signal.
 */
function SupplementRow({
  supplement,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  supplement: Supplement
  busy: boolean
  onToggle: (taken: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const nameId = `supplement-name-${supplement.id}`
  const dose = doseLabel(supplement)
  const period = periodLabel(supplement)

  return (
    <li className="supplement-row">
      <input
        type="checkbox"
        className="supplement-check"
        id={`supplement-taken-${supplement.id}`}
        aria-labelledby={nameId}
        checked={supplement.takenToday}
        disabled={busy}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <div className="supplement-body">
        <h3 id={nameId} className="supplement-name">
          {supplement.name}
        </h3>
        {dose && <p className="supplement-dose">{dose}</p>}
        {period && <p className="supplement-period">{period}</p>}
        <div className="supplement-row-actions">
          <button
            type="button"
            className="supplement-quiet-button"
            disabled={busy}
            onClick={onEdit}
          >
            Edytuj
            <span className="visually-hidden"> pozycję {supplement.name}</span>
          </button>
          {confirming ? (
            /* Asks twice: deleting takes this preparation's ticks with it and
               the patient cannot undo it. The consequence is stated here rather
               than only in the button, because a second tap on a phone is
               easily a stray one. */
            <span className="supplement-confirm">
              <span className="supplement-confirm-text">
                Usunąć „{supplement.name}” razem z odhaczeniami? Tego nie da się
                cofnąć.
              </span>
              <button
                type="button"
                className="supplement-danger-button"
                disabled={busy}
                onClick={onDelete}
              >
                Tak, usuń
              </button>
              <button
                type="button"
                className="supplement-quiet-button"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Zostaw
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="supplement-quiet-button"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Usuń
              <span className="visually-hidden"> pozycję {supplement.name}</span>
            </button>
          )}
        </div>
      </div>
      {supplement.hour && <span className="supplement-hour">{supplement.hour}</span>}
    </li>
  )
}

/**
 * The add/edit form — one component for both, because they are one set of rules
 * about what a preparation may be. A second copy would be a second answer.
 *
 * Only "Nazwa" is required, which is the module's own rule rather than a
 * looseness: somebody who knows they take magnesium and not the dose has to be
 * able to write it down. Nothing on it is marked with an asterisk except that
 * one, and no other field can fail.
 */
function SupplementForm({
  initial,
  editing,
  busy,
  errors,
  onSubmit,
  onCancel,
}: {
  initial: SupplementInput
  editing: boolean
  busy: boolean
  errors: FieldErrors
  onSubmit: (input: SupplementInput) => void
  onCancel: () => void
}) {
  const [input, setInput] = useState(initial)
  const nameMissing = input.name.trim() === ''

  function set<K extends keyof SupplementInput>(key: K, value: SupplementInput[K]) {
    setInput((current) => ({ ...current, [key]: value }))
  }

  return (
    <form
      className="supplement-card supplement-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!nameMissing) onSubmit(input)
      }}
    >
      <h2>{editing ? 'Edytuj pozycję' : 'Nowa pozycja'}</h2>

      <div className="supplement-field">
        <label htmlFor="supplement-name">Nazwa</label>
        <input
          id="supplement-name"
          value={input.name}
          autoFocus
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'supplement-name-error' : undefined}
          onChange={(event) => set('name', event.target.value)}
        />
        {errors.name && (
          <span id="supplement-name-error" className="supplement-field-error">
            {errors.name}
          </span>
        )}
      </div>

      <div className="supplement-field-row">
        <div className="supplement-field">
          <label htmlFor="supplement-dose">Dawka</label>
          <input
            id="supplement-dose"
            value={input.dose ?? ''}
            placeholder="np. 2000 IU"
            onChange={(event) => set('dose', event.target.value)}
          />
        </div>
        <div className="supplement-field">
          <label htmlFor="supplement-frequency">Częstotliwość</label>
          <input
            id="supplement-frequency"
            value={input.frequency ?? ''}
            placeholder="np. raz dziennie"
            onChange={(event) => set('frequency', event.target.value)}
          />
        </div>
      </div>

      <div className="supplement-field-row">
        <div className="supplement-field">
          <label htmlFor="supplement-hour">Godzina</label>
          <input
            id="supplement-hour"
            type="time"
            value={input.hour ?? ''}
            onChange={(event) => set('hour', event.target.value)}
          />
        </div>
        <div className="supplement-field">
          <label htmlFor="supplement-start">Od kiedy</label>
          <input
            id="supplement-start"
            type="date"
            value={input.startDate ?? ''}
            onChange={(event) => set('startDate', event.target.value)}
          />
        </div>
        <div className="supplement-field">
          <label htmlFor="supplement-end">Do kiedy</label>
          <input
            id="supplement-end"
            type="date"
            value={input.endDate ?? ''}
            aria-invalid={Boolean(errors.endDate)}
            aria-describedby={errors.endDate ? 'supplement-end-error' : undefined}
            onChange={(event) => set('endDate', event.target.value)}
          />
          {/* Said rather than only enforced: an empty end date is a complete
              answer, and the screen has to say which one it is. */}
          <span className="supplement-field-hint">
            Puste znaczy „bezterminowo”.
          </span>
          {errors.endDate && (
            <span id="supplement-end-error" className="supplement-field-error">
              {errors.endDate}
            </span>
          )}
        </div>
      </div>

      <label className="supplement-toggle" htmlFor="supplement-reminder">
        <input
          id="supplement-reminder"
          type="checkbox"
          checked={input.reminderEnabled}
          onChange={(event) => set('reminderEnabled', event.target.checked)}
        />
        <span>Chcę ciche przypomnienie o tej godzinie</span>
      </label>
      <p className="supplement-note">{REMINDER_NOTE}</p>

      <div className="supplement-form-actions">
        <button
          type="submit"
          className="supplement-submit"
          disabled={busy || nameMissing}
        >
          {editing ? 'Zapisz zmiany' : 'Dodaj do listy'}
        </button>
        <button
          type="button"
          className="supplement-quiet-button"
          disabled={busy}
          onClick={onCancel}
        >
          Anuluj
        </button>
      </div>
    </form>
  )
}

function DietSupplements() {
  const [supplements, setSupplements] = useState<Supplement[] | null>(null)
  const [loading, setLoading] = useState(true)
  /**
   * Why the screen has nothing to draw — **the server's own sentence when it
   * gave one**, and a generic fallback only when it did not.
   *
   * This is not a nicety. Every refusal a patient can actually meet here is a
   * *gate*, not a fault: an account waiting on a guardian's acceptance (RODO
   * art. 8) or one whose consents are not in force. The API answers those with
   * a message that says so and what to do about it, and a screen that replaced
   * it with "nie udało się wczytać listy suplementów i leków" would be telling
   * somebody a request failed when in fact they were told to ask somebody else
   * to answer a form. `Journals.tsx` already words it this way; this screen
   * used to throw the message away.
   */
  const [loadError, setLoadError] = useState<string | null>(null)
  /** A refusal for the act just attempted, separate from `loadError`, which
   *  means the screen has nothing to draw at all. */
  const [actionError, setActionError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  /** null = the form is closed, '' = adding, an id = editing that row. */
  const [formFor, setFormFor] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const pages = usePagination(supplements ?? [])

  // The house pattern: a promise chain with a `cancelled` flag rather than an
  // `async` effect body.
  useEffect(() => {
    let cancelled = false

    fetchSupplements()
      .then((loaded) => {
        if (cancelled) return
        setSupplements(loaded)
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
   * The page a row is on, once the rebuilt list has come back.
   *
   * Needed because the list is ordered by hour: a preparation taken at 8:00,
   * written into a list that starts at 12:00, goes to the *front*, and one with
   * no hour goes to the very end. So neither "stay where you are" nor "go to
   * page one" reliably shows the row that was just saved, which on a paginated
   * list reads as a save that did nothing.
   */
  function revealPageOf(list: Supplement[], id: string | undefined) {
    if (id === undefined) return
    const index = list.findIndex((item) => item.id === id)
    if (index >= 0) pages.goTo(Math.floor(index / PAGE_SIZE) + 1)
  }

  /** Every write answers with the rebuilt list, so nothing here patches state
   *  of its own — what is on screen is what the server holds. */
  async function run(
    act: () => Promise<Supplement[] | void>,
    fallback: string,
    { closeForm = false, reveal = false } = {},
  ) {
    if (busy) return
    setBusy(true)
    setActionError(null)
    setErrors({})
    // Taken before the write, so the one id the rebuilt list has that this set
    // does not is the row that was just created.
    const before = new Set((supplements ?? []).map((item) => item.id))
    try {
      const list = (await act()) ?? (await fetchSupplements())
      setSupplements(list)
      if (reveal) {
        revealPageOf(list, list.find((item) => !before.has(item.id))?.id ?? formFor ?? undefined)
      }
      if (closeForm) setFormFor(null)
    } catch (error) {
      const found = fieldErrors(error)
      setErrors(found)
      // Only shown at the top when it did not land on a field — otherwise the
      // same sentence would appear twice.
      if (Object.keys(found).length === 0) {
        setActionError(error instanceof ApiError ? error.message : fallback)
      }
    } finally {
      setBusy(false)
    }
  }

  const editing = formFor ? supplements?.find((s) => s.id === formFor) : undefined
  const count = supplements?.length ?? 0

  return (
    <div className="supplement-page">
      <header className="supplement-header">
        <div>
          <p className="supplement-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Suplementy i leki</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="supplement-back" to={ROUTES.diet}>
        ← Wróć do strony głównej
      </Link>

      {loading && <p className="supplement-loading">Wczytywanie…</p>}

      {loadError && (
        <LoadError message={loadError} onRetry={retry} className="supplement-error" />
      )}

      {supplements && !loadError && (
        <>
          {actionError && (
            <p className="supplement-error" role="alert">
              {actionError}
            </p>
          )}

          {count === 0 ? (
            /* An empty list is an ordinary state — most people take nothing —
               so it says so plainly and offers the one action, rather than
               reading as something that failed to load. */
            <section className="supplement-card supplement-empty">
              <h2>Nic tu jeszcze nie ma</h2>
              <p>
                Jeśli przyjmujesz suplementy albo leki, możesz je tu zapisać razem
                z dawką i godziną. Nic nie jest wymagane — wystarczy nazwa.
              </p>
            </section>
          ) : (
            <section
              className="supplement-card"
              aria-labelledby="supplement-list-heading"
            >
              <h2 id="supplement-list-heading">Twoja lista</h2>
              <p className="supplement-note">{LIST_LEAD}</p>
              <ul
                className="supplement-list"
                /* The one place a count appears, and it describes what the
                   ticks already say on screen. Never rendered as a figure —
                   see the file header. */
                aria-label={
                  `Lista: ${count} ${pluralItems(count)}, ` +
                  `odhaczone dziś: ${takenCount(supplements)}` +
                  // Only when there is more than one, so the ordinary list says
                  // exactly what it always said. The counts before it stay over
                  // the whole list — see the note in the file header.
                  (pages.pageCount > 1 ? `; na tej stronie: ${pages.from}–${pages.to}` : '')
                }
              >
                {pages.items.map((supplement) => (
                  <SupplementRow
                    key={supplement.id}
                    supplement={supplement}
                    busy={busy}
                    onToggle={(taken) =>
                      void run(
                        () => setSupplementTaken(supplement.id, taken),
                        'Nie udało się zapisać odhaczenia.',
                      )
                    }
                    onEdit={() => {
                      setErrors({})
                      setFormFor(supplement.id)
                    }}
                    onDelete={() =>
                      void run(
                        () => deleteSupplement(supplement.id),
                        'Nie udało się usunąć pozycji.',
                        { closeForm: true },
                      )
                    }
                  />
                ))}
              </ul>
              <Pagination
                page={pages.page}
                pageCount={pages.pageCount}
                from={pages.from}
                to={pages.to}
                total={pages.total}
                onChange={pages.goTo}
                unit="pozycji"
              />
            </section>
          )}

          {formFor === null ? (
            <button
              type="button"
              className="supplement-add"
              onClick={() => {
                setErrors({})
                setFormFor('')
              }}
            >
              + Dodaj suplement lub lek
            </button>
          ) : (
            <SupplementForm
              /* Keyed on which row is being edited, so opening the form for a
                 second position redraws it with that position's values instead
                 of keeping the first one's. */
              key={formFor || 'new'}
              initial={editing ? toInput(editing) : EMPTY_INPUT}
              editing={Boolean(editing)}
              busy={busy}
              errors={errors}
              onSubmit={(input) =>
                void run(
                  () =>
                    editing
                      ? updateSupplement(editing.id, input)
                      : createSupplement(input),
                  'Nie udało się zapisać pozycji.',
                  // The list is hour-ordered, so the saved row may well be on
                  // another page than the one the form was opened from.
                  { closeForm: true, reveal: true },
                )
              }
              onCancel={() => {
                setErrors({})
                setFormFor(null)
              }}
            />
          )}

          <section className="supplement-card supplement-reminders">
            <h2>Przypomnienia</h2>
            <p className="supplement-note">{REMINDER_NOTE}</p>
          </section>
        </>
      )}
    </div>
  )
}

export default DietSupplements
