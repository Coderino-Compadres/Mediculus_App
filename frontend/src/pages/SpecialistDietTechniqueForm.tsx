import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import {
  createDietTechnique,
  fetchMyDietTechniques,
  updateDietTechnique,
  type DietTechniqueInput,
  type StoredDietTechnique,
} from '../api/dietTechniques'
import { techniqueSlug } from '../utils/slug'
import { ROUTES } from '../routes'
import './journals.css'
import '../components/auth.css'
import '../styles/panel.css'
import './specialist.css'

/**
 * The form that writes a psychodietetic technique into the diet catalogue, and
 * edits one — the diet module's `SpecialistTechniqueForm`.
 *
 * THE FIELDS ARE THE DIET CATALOGUE'S OWN SHAPE (`types/dietTechnique.ts`), not
 * the DBT one: no tabs, no DBT group or module, but an example and a closing
 * note, which is how the client's own fifteen techniques are written. So a
 * technique written here renders on the same detail screen as hers, card for
 * card.
 *
 * The same rules as the DBT form, for the same reasons (see that file): the
 * slug is derived from the name and never asked for, on an edit the stored slug
 * is sent back verbatim because the backend refuses a change, and saving is
 * publishing — said above the form rather than asked.
 */

const LOAD_ERROR = 'Nie udało się wczytać techniki. Spróbuj ponownie.'
const SAVE_ERROR = 'Nie udało się zapisać techniki. Spróbuj ponownie.'
const NOT_FOUND = 'Nie znaleziono tej techniki wśród Twoich technik.'
const NAME_TAKEN =
  'Technika o tej nazwie już jest w katalogu — nazwy nie mogą się powtarzać, '
  + 'bo z nazwy powstaje adres techniki. Zmień nazwę.'

const EMPTY_STEP = { name: '', description: '' }

const EMPTY: DietTechniqueInput = {
  slug: '',
  name: '',
  moment: '',
  intro: '',
  durationMin: '',
  steps: [{ ...EMPTY_STEP }],
  example: '',
  note: '',
}

/** A stored technique back into the form's own state. */
function toInput(technique: StoredDietTechnique): DietTechniqueInput {
  return {
    slug: technique.id,
    name: technique.nazwa,
    moment: technique.momentZastosowania ?? '',
    intro: technique.wprowadzenie,
    durationMin: technique.czasTrwaniaMin ? String(technique.czasTrwaniaMin) : '',
    steps: technique.kroki.length
      ? technique.kroki.map((step) => ({ name: step.nazwa ?? '', description: step.opis }))
      : [{ ...EMPTY_STEP }],
    example: technique.przyklad ?? '',
    note: technique.notka ?? '',
  }
}

function SpecialistDietTechniqueForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editing = id !== undefined
  const idTechnique = editing ? Number(id) : null

  const [form, setForm] = useState<DietTechniqueInput>(EMPTY)
  const [loading, setLoading] = useState(editing)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The list is the only endpoint that returns a specialist's own techniques,
  // so an edit reads it and picks the row.
  useEffect(() => {
    if (!editing) return
    let cancelled = false

    fetchMyDietTechniques()
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

  function set<K extends keyof DietTechniqueInput>(field: K, value: DietTechniqueInput[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function setStep(index: number, field: 'name' | 'description', value: string) {
    set(
      'steps',
      form.steps.map((step, position) =>
        position === index ? { ...step, [field]: value } : step,
      ),
    )
  }

  /** Which step is empty, named before the request — see the DBT form for why. */
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
      if (editing && idTechnique !== null) {
        // form.slug came from the stored technique and no input touched it.
        await updateDietTechnique(idTechnique, form)
      } else {
        await createDietTechnique({ ...form, slug: techniqueSlug(form.name) })
      }
      navigate(ROUTES.specialistDietTechniques)
    } catch (cause: unknown) {
      if (cause instanceof ApiError) {
        setErrors({
          // The slug has no input; derived from the name, its only reachable
          // refusal is that the name is taken.
          name: cause.fieldErrors.name || (cause.fieldErrors.slug ? NAME_TAKEN : ''),
          moment: cause.fieldErrors.moment ?? '',
          intro: cause.fieldErrors.intro ?? '',
          steps: cause.fieldErrors.steps ?? '',
          durationMin: cause.fieldErrors.duration_min ?? '',
          example: cause.fieldErrors.example ?? '',
          note: cause.fieldErrors.note ?? '',
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
        <p className="panel-loading" role="status" aria-busy="true">
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
        <Link to={ROUTES.specialistDietTechniques}>← Wróć do moich technik</Link>
      </div>
    )
  }

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL SPECJALISTY</p>
          <h1>{editing ? 'Edycja techniki' : 'Nowa technika psychodietetyczna'}</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistDietTechniques}>
        ← Wróć do moich technik
      </Link>

      <p className="reports-intro">
        {editing
          ? 'Zapisane zmiany widzą od razu wszyscy pacjenci aplikacji.'
          : 'Dodana technika jest od razu widoczna dla wszystkich pacjentów w zakładce „Techniki psychodietetyczne”.'}
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
          <label htmlFor="intro">Wprowadzenie</label>
          <textarea
            id="intro"
            rows={4}
            value={form.intro}
            onChange={(event) => set('intro', event.target.value)}
            aria-invalid={Boolean(errors.intro)}
          />
          <span className="specialist-form-hint">
            Czemu ta technika służy. Pacjent czyta to nad listą kroków.
          </span>
          {errors.intro && <span className="auth-field-error">{errors.intro}</span>}
        </div>

        <div className="auth-field">
          <label htmlFor="moment">Kiedy po nią sięgnąć</label>
          <input
            id="moment"
            value={form.moment}
            onChange={(event) => set('moment', event.target.value)}
            aria-invalid={Boolean(errors.moment)}
          />
          <span className="specialist-form-hint">
            Nieobowiązkowe, np. „przed jedzeniem”. Pacjent widzi to na liście.
          </span>
          {errors.moment && <span className="auth-field-error">{errors.moment}</span>}
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
            Nieobowiązkowe. Lepiej zostawić puste niż podać zmyśloną liczbę.
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
                    className="panel-button-quiet"
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
            </div>
          ))}
          <button
            type="button"
            className="panel-link"
            onClick={() => set('steps', [...form.steps, { ...EMPTY_STEP }])}
          >
            Dodaj krok
          </button>
        </fieldset>

        <div className="auth-field">
          <label htmlFor="note">Uwaga pod krokami</label>
          <textarea
            id="note"
            rows={2}
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
            aria-invalid={Boolean(errors.note)}
          />
          <span className="specialist-form-hint">
            Nieobowiązkowa. Zdanie zamykające listę kroków, które samo nie jest
            krokiem (np. do czego technika nie służy).
          </span>
          {errors.note && <span className="auth-field-error">{errors.note}</span>}
        </div>

        <div className="auth-field">
          <label htmlFor="example">Przykład</label>
          <textarea
            id="example"
            rows={3}
            value={form.example}
            onChange={(event) => set('example', event.target.value)}
            aria-invalid={Boolean(errors.example)}
          />
          <span className="specialist-form-hint">
            Nieobowiązkowy. Pacjent widzi go w osobnej karcie pod krokami.
          </span>
          {errors.example && <span className="auth-field-error">{errors.example}</span>}
        </div>

        {formError && (
          <p className="panel-error" role="alert">
            {formError}
          </p>
        )}

        <button type="submit" className="panel-button" disabled={saving}>
          {saving ? 'Zapisywanie…' : editing ? 'Zapisz zmiany' : 'Dodaj technikę'}
        </button>
      </form>
    </div>
  )
}

export default SpecialistDietTechniqueForm
