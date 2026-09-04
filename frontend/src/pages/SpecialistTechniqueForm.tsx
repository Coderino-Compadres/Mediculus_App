import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import SelectField from '../components/SelectField'
import { ApiError } from '../api/client'
import {
  createTechnique,
  fetchMyTechniques,
  updateTechnique,
  type StoredTechnique,
  type TechniqueInput,
} from '../api/techniques'
import { DBT_GROUPS, DBT_MODULE_LABELS, SCHOOL_TABS } from '../utils/techniques'
import type { TechniqueDbtModule, TechniqueGroup, TechniqueSchool } from '../types/technique'
import { ROUTES } from '../routes'
import './journals.css'
import '../components/auth.css'
import './specialist.css'

/**
 * The form that writes a technique into the catalogue, and edits one.
 *
 * One screen for both, because the fields are identical and two copies of a form
 * this long is two places for a clinical field to go missing. `:id` in the URL is
 * what tells them apart.
 *
 * WHAT THE FIELDS ARE. They are the catalogue's own shape — `types/technique.ts`
 * — because a technique a specialist writes is a catalogue entry like any other
 * (see core/techniques.py). So: the tabs it appears in (several, deliberately —
 * a technique can be both a DBT skill and a relaxation exercise), the DBT group
 * and module, an introduction, and the ordered steps. Nothing here is invented
 * for the panel and nothing the built-in techniques have is missing.
 *
 * THE IDENTIFIER IS IMMUTABLE, and the form says so on an edit rather than
 * silently ignoring a change: it is in the URL of a technique patients may
 * already have opened, and freeing the old slug for something else is worse than
 * refusing to rename.
 *
 * WHAT THIS FORM DELIBERATELY DOES NOT ASK. There was a "Gotowa do publikacji"
 * checkbox (a draft state) and a "Tylko do wprowadzenia przez specjalistę" one
 * (the source material's safety flag); both were removed on request. Saving a
 * technique here puts it in every patient's catalogue, and the screen says so
 * above the form rather than making it a decision. The columns behind them still
 * exist — see `_fields` in core/techniques.py — so if the client ever asks for
 * drafts or per-technique unlocking, this is the form to add them back to, not a
 * schema change.
 */

const LOAD_ERROR = 'Nie udało się wczytać techniki. Spróbuj ponownie.'
const SAVE_ERROR = 'Nie udało się zapisać techniki. Spróbuj ponownie.'
const NOT_FOUND = 'Nie znaleziono tej techniki wśród Twoich technik.'

const EMPTY_STEP = { name: '', description: '', examples: '' }

const EMPTY: TechniqueInput = {
  slug: '',
  name: '',
  subtitle: '',
  schools: [],
  dbtGroup: '',
  dbtModule: '',
  intro: '',
  durationMin: '',
  steps: [{ ...EMPTY_STEP }],
}

/** A stored technique back into the form's own state. */
function toInput(technique: StoredTechnique): TechniqueInput {
  return {
    slug: technique.id,
    name: technique.nazwa,
    subtitle: technique.podtytul,
    schools: technique.szkola,
    dbtGroup: technique.grupa ?? '',
    dbtModule: technique.modulDBT ?? '',
    intro: technique.wprowadzenie,
    durationMin: technique.czasTrwaniaMin ? String(technique.czasTrwaniaMin) : '',
    steps: technique.kroki.length
      ? technique.kroki.map((step) => ({
          name: step.nazwa ?? '',
          description: step.opis,
          // One per line, which is how the textarea asks for them.
          examples: (step.przyklady ?? []).join('\n'),
        }))
      : [{ ...EMPTY_STEP }],
  }
}

function SpecialistTechniqueForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editing = id !== undefined
  const idTechnique = editing ? Number(id) : null

  const [form, setForm] = useState<TechniqueInput>(EMPTY)
  const [loading, setLoading] = useState(editing)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The list is the only endpoint that returns a specialist's own techniques
  // (drafts included), so an edit reads it and picks the row. One request either
  // way, and no second endpoint to keep in step with the first.
  useEffect(() => {
    if (!editing) return
    let cancelled = false

    fetchMyTechniques()
      .then((mine) => {
        if (cancelled) return
        const found = mine.find((entry) => entry.idTechnique === idTechnique)
        if (found) {
          setForm(toInput(found))
          setLoadError(null)
        } else {
          setLoadError(NOT_FOUND)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [editing, idTechnique, attempt])

  function set<K extends keyof TechniqueInput>(field: K, value: TechniqueInput[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function toggleSchool(school: TechniqueSchool) {
    set(
      'schools',
      form.schools.includes(school)
        ? form.schools.filter((entry) => entry !== school)
        : [...form.schools, school],
    )
  }

  function setStep(index: number, field: 'name' | 'description' | 'examples', value: string) {
    set(
      'steps',
      form.steps.map((step, position) =>
        position === index ? { ...step, [field]: value } : step,
      ),
    )
  }

  /**
   * The one thing worth checking before the request: which step is empty.
   *
   * The backend refuses an empty step description either way, but its answer is
   * positional (`steps: [{description: [...]}, {}]`) and by the time it reaches
   * `ApiError` the position is gone — so the message could only be shown above
   * the whole list, leaving a specialist with six steps to hunt for the blank
   * one. Named here instead. Everything else is left to the backend, which is
   * the only thing that can answer it (a slug collision, for instance).
   */
  function emptyStep(): string | null {
    const index = form.steps.findIndex((step) => step.description.trim() === '')
    if (index === -1) return null
    return `Krok ${index + 1} nie ma opisu. Opis kroku jest tym, co czyta pacjent.`
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const blank = emptyStep()
    if (blank) {
      setErrors({ steps: blank })
      setFormError(null)
      return
    }
    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      if (editing && idTechnique !== null) await updateTechnique(idTechnique, form)
      else await createTechnique(form)
      navigate(ROUTES.specialistTechniques)
    } catch (cause: unknown) {
      if (cause instanceof ApiError) {
        setErrors({
          slug: cause.fieldErrors.slug ?? '',
          name: cause.fieldErrors.name ?? '',
          schools: cause.fieldErrors.schools ?? '',
          intro: cause.fieldErrors.intro ?? '',
          // The backend reports a per-step problem under `steps`; the form shows
          // it above the whole list rather than guessing which step it meant.
          steps: cause.fieldErrors.steps ?? '',
          durationMin: cause.fieldErrors.duration_min ?? '',
        })
        setFormError(cause.formMessage)
      } else {
        setFormError(SAVE_ERROR)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="journals-page">
        <p className="journals-status" role="status" aria-busy="true">
          Wczytywanie techniki…
        </p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="journals-page">
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
        <Link to={ROUTES.specialistTechniques}>← Wróć do moich technik</Link>
      </div>
    )
  }

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL SPECJALISTY</p>
          <h1>{editing ? 'Edycja techniki' : 'Nowa technika'}</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistTechniques}>
        ← Wróć do moich technik
      </Link>

      {/* Stated, not asked. Saving is publishing here, so the consequence belongs
          above the form rather than behind a checkbox somebody can miss. */}
      <p className="reports-intro">
        {editing
          ? 'Zapisane zmiany widzą od razu wszyscy pacjenci aplikacji.'
          : 'Dodana technika jest od razu widoczna dla wszystkich pacjentów w zakładce „Techniki terapeutyczne”.'}
      </p>

      <form className="specialist-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="auth-field">
          <label htmlFor="name">Nazwa techniki</label>
          <input
            id="name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <span className="auth-field-error">{errors.name}</span>}
        </div>

        <div className="auth-field">
          <label htmlFor="slug">Identyfikator w adresie</label>
          <input
            id="slug"
            value={form.slug}
            onChange={(event) => set('slug', event.target.value)}
            readOnly={editing}
            aria-invalid={Boolean(errors.slug)}
          />
          <span className="specialist-form-hint">
            {editing
              ? 'Identyfikatora nie można zmienić — pacjenci mogą mieć zapisany link do tej techniki.'
              : 'Małe litery bez polskich znaków, cyfry i łączniki, np. „radykalna-akceptacja”.'}
          </span>
          {errors.slug && <span className="auth-field-error">{errors.slug}</span>}
        </div>

        <div className="auth-field">
          <label htmlFor="subtitle">Podtytuł</label>
          <input
            id="subtitle"
            value={form.subtitle}
            onChange={(event) => set('subtitle', event.target.value)}
          />
          <span className="specialist-form-hint">
            Jedno zdanie: po co jest ta technika. Pacjent widzi je na liście.
          </span>
        </div>

        <fieldset className="specialist-fieldset">
          <legend>Zakładki katalogu</legend>
          <span className="specialist-form-hint">
            Można wybrać więcej niż jedną — technika istnieje raz, a pokazuje się
            w każdej wskazanej zakładce.
          </span>
          {SCHOOL_TABS.map((tab) => (
            <label key={tab.school} className="specialist-check">
              <input
                type="checkbox"
                checked={form.schools.includes(tab.school)}
                onChange={() => toggleSchool(tab.school)}
              />
              {tab.label}
            </label>
          ))}
          {errors.schools && <span className="auth-field-error">{errors.schools}</span>}
        </fieldset>

        <SelectField
          id="dbtGroup"
          label="Grupa w zakładce DBT"
          placeholder="Bez grupy"
          value={form.dbtGroup}
          onChange={(event) => set('dbtGroup', event.target.value as TechniqueGroup | '')}
          options={DBT_GROUPS.map((group) => ({ value: group.group, label: group.label }))}
        />

        <SelectField
          id="dbtModule"
          label="Moduł DBT"
          placeholder="Nie podaję"
          value={form.dbtModule}
          onChange={(event) => set('dbtModule', event.target.value as TechniqueDbtModule | '')}
          options={Object.entries(DBT_MODULE_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />

        <div className="auth-field">
          <label htmlFor="intro">Wprowadzenie</label>
          <textarea
            id="intro"
            rows={4}
            value={form.intro}
            onChange={(event) => set('intro', event.target.value)}
            aria-invalid={Boolean(errors.intro)}
          />
          <span className="specialist-form-hint">
            Czemu ta technika służy i kiedy po nią sięgnąć. Pacjent czyta to nad
            listą kroków.
          </span>
          {errors.intro && <span className="auth-field-error">{errors.intro}</span>}
        </div>

        <div className="auth-field">
          <label htmlFor="durationMin">Czas trwania (minuty)</label>
          <input
            id="durationMin"
            inputMode="numeric"
            value={form.durationMin}
            onChange={(event) => set('durationMin', event.target.value)}
            aria-invalid={Boolean(errors.durationMin)}
          />
          <span className="specialist-form-hint">
            Nieobowiązkowe. Wbudowane techniki nie podają czasu, bo materiały
            źródłowe go nie określają — lepiej zostawić puste niż podać zmyśloną
            liczbę.
          </span>
          {errors.durationMin && <span className="auth-field-error">{errors.durationMin}</span>}
        </div>

        <fieldset className="specialist-fieldset">
          <legend>Kroki</legend>
          {errors.steps && <span className="auth-field-error">{errors.steps}</span>}
          {form.steps.map((step, index) => (
            <div key={index} className="specialist-step">
              <div className="specialist-step-header">
                <span className="specialist-step-number">Krok {index + 1}</span>
                {form.steps.length > 1 && (
                  <button
                    type="button"
                    className="caseload-card-drop"
                    onClick={() =>
                      set(
                        'steps',
                        form.steps.filter((_, position) => position !== index),
                      )
                    }
                  >
                    Usuń krok
                  </button>
                )}
              </div>
              <div className="auth-field">
                <label htmlFor={`step-name-${index}`}>Nazwa kroku</label>
                <input
                  id={`step-name-${index}`}
                  value={step.name}
                  onChange={(event) => setStep(index, 'name', event.target.value)}
                />
                <span className="specialist-form-hint">
                  Nieobowiązkowa — krok bez nazwy pokazuje się z samym numerem.
                </span>
              </div>
              <div className="auth-field">
                <label htmlFor={`step-description-${index}`}>Opis kroku</label>
                <textarea
                  id={`step-description-${index}`}
                  rows={4}
                  value={step.description}
                  onChange={(event) => setStep(index, 'description', event.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor={`step-examples-${index}`}>Przykłady</label>
                <textarea
                  id={`step-examples-${index}`}
                  rows={3}
                  value={step.examples}
                  onChange={(event) => setStep(index, 'examples', event.target.value)}
                />
                <span className="specialist-form-hint">Po jednym w wierszu.</span>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="caseload-card-link"
            onClick={() => set('steps', [...form.steps, { ...EMPTY_STEP }])}
          >
            Dodaj krok
          </button>
        </fieldset>

        {formError && (
          <p className="caseload-error" role="alert">
            {formError}
          </p>
        )}

        <button type="submit" className="specialist-form-submit" disabled={saving}>
          {saving ? 'Zapisywanie…' : editing ? 'Zapisz zmiany' : 'Dodaj technikę'}
        </button>
      </form>
    </div>
  )
}

export default SpecialistTechniqueForm
