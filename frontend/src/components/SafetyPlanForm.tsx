import { useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import {
  saveSafetyPlan,
  toInput,
  type SafetyPlanInput,
} from '../api/safetyPlan'
import type { SafetyPlan } from '../types/safetyPlan'
import './auth.css'

/**
 * The patient writes their own safety plan here — create and edit are one form.
 *
 * FIVE PARTS, IN THE ORDER THE PLAN IS READ: warning signs first (what the
 * client said the feature is for), then what helps, people to reach out to, a
 * professional, and anything else. Nothing is required — a plan with one line
 * in it is a plan.
 *
 * DELIBERATELY NO "means restriction" part (listing ways somebody could hurt
 * themselves), which a classic Stanley-Brown plan has: that step belongs with a
 * clinician present, not in a form used alone and by minors. See
 * types/safetyPlan.ts.
 *
 * The whole plan is saved at once (PUT) and the server answers it as stored,
 * which is what the page shows next — so a line the server trimmed or dropped
 * is gone from the screen too, not only from the database.
 */

const SAVE_ERROR = 'Nie udało się zapisać planu. Spróbuj ponownie.'

export const HINTS = {
  warningSigns:
    'Co u Ciebie zwykle zapowiada gorszy czas — myśli, uczucia, zachowania. Np. „nie śpię dwie noce z rzędu”.',
  copingStrategies:
    'Co możesz zrobić sam(a), żeby było choć trochę lżej. Np. „spacer, choćby na 10 minut”.',
  trustedPeople: 'Osoby, do których możesz się odezwać, kiedy jest trudno.',
  contact:
    'Lekarz albo terapeuta, do którego chcesz mieć numer pod ręką. Jeśli zostawisz puste, pokażemy specjalistę, który Cię prowadzi.',
  notes: 'Wszystko inne, o czym chcesz pamiętać w trudnej chwili.',
}

function LinesEditor({
  id,
  label,
  hint,
  lines,
  onChange,
  addLabel,
}: {
  id: string
  label: string
  hint: string
  lines: string[]
  onChange: (lines: string[]) => void
  addLabel: string
}) {
  return (
    <fieldset className="safety-plan-form-group">
      <legend>{label}</legend>
      <p className="safety-plan-form-hint" id={`${id}-hint`}>
        {hint}
      </p>
      {lines.map((line, index) => (
        // Keyed by position: lines are free text with no identity of their own,
        // and removing one re-renders the rest — which is what the form means.
        <div key={index} className="safety-plan-form-row">
          <input
            id={`${id}-${index}`}
            aria-label={`${label} — pozycja ${index + 1}`}
            aria-describedby={`${id}-hint`}
            value={line}
            maxLength={300}
            onChange={(event) =>
              onChange(lines.map((value, at) => (at === index ? event.target.value : value)))
            }
          />
          {lines.length > 1 && (
            <button
              type="button"
              className="safety-plan-form-remove"
              aria-label={`Usuń pozycję ${index + 1} z listy „${label}”`}
              onClick={() => onChange(lines.filter((_, at) => at !== index))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button type="button" className="safety-plan-form-add" onClick={() => onChange([...lines, ''])}>
        + {addLabel}
      </button>
    </fieldset>
  )
}

function SafetyPlanForm({
  plan,
  onSaved,
  onCancel,
}: {
  plan: SafetyPlan | null
  onSaved: (plan: SafetyPlan) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<SafetyPlanInput>(() => toInput(plan))
  const [saving, setSaving] = useState(false)
  // The guard against a double tap. A ref, not `saving`: two clicks in the same
  // tick both read the state from before the first one re-rendered, and both
  // would send — the duplicate-save bug the meal and supplement forms have.
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof SafetyPlanInput>(key: K, value: SafetyPlanInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setPerson(index: number, field: 'name' | 'relation' | 'phone', value: string) {
    set(
      'trustedPeople',
      form.trustedPeople.map((person, at) => (at === index ? { ...person, [field]: value } : person)),
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // One request at a time: a double tap must not save twice.
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      onSaved(await saveSafetyPlan(form))
    } catch (cause: unknown) {
      if (cause instanceof ApiError) {
        // The server's verdicts are positional (which person, which line) and
        // arrive flattened; the first one is shown above the save button, with
        // its field named where the message itself does not say it.
        const first = Object.values(cause.fieldErrors)[0]
        setError(first || cause.formMessage || SAVE_ERROR)
      } else {
        setError(SAVE_ERROR)
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <form className="safety-plan-card safety-plan-form auth-form" onSubmit={(event) => void submit(event)} noValidate>
      <h2 id="safety-plan-heading">{plan ? 'Edytuj swój plan' : 'Utwórz swój plan'}</h2>
      <p className="safety-plan-lead">
        Pisz własnymi słowami. Nic tu nie jest wymagane — możesz zacząć od jednej rzeczy i dopisywać
        kolejne później. Plan widzisz tylko Ty.
      </p>

      <LinesEditor
        id="warning-signs"
        label="Sygnały ostrzegawcze"
        hint={HINTS.warningSigns}
        lines={form.warningSigns}
        onChange={(lines) => set('warningSigns', lines)}
        addLabel="Dodaj sygnał"
      />

      <LinesEditor
        id="coping-strategies"
        label="Sposoby radzenia sobie"
        hint={HINTS.copingStrategies}
        lines={form.copingStrategies}
        onChange={(lines) => set('copingStrategies', lines)}
        addLabel="Dodaj sposób"
      />

      <fieldset className="safety-plan-form-group">
        <legend>Osoby, do których mogę się zwrócić</legend>
        <p className="safety-plan-form-hint">{HINTS.trustedPeople}</p>
        {form.trustedPeople.map((person, index) => (
          <div key={index} className="safety-plan-form-person">
            <div className="auth-field">
              <label htmlFor={`person-name-${index}`}>Imię</label>
              <input
                id={`person-name-${index}`}
                value={person.name}
                maxLength={100}
                onChange={(event) => setPerson(index, 'name', event.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor={`person-relation-${index}`}>Kim jest dla Ciebie</label>
              <input
                id={`person-relation-${index}`}
                value={person.relation}
                maxLength={100}
                placeholder="np. siostra, przyjaciółka"
                onChange={(event) => setPerson(index, 'relation', event.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor={`person-phone-${index}`}>Telefon</label>
              <input
                id={`person-phone-${index}`}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={person.phone}
                maxLength={30}
                onChange={(event) => setPerson(index, 'phone', event.target.value)}
              />
            </div>
            <button
              type="button"
              className="safety-plan-form-remove-person"
              onClick={() => set('trustedPeople', form.trustedPeople.filter((_, at) => at !== index))}
            >
              Usuń osobę
            </button>
          </div>
        ))}
        <button
          type="button"
          className="safety-plan-form-add"
          onClick={() => set('trustedPeople', [...form.trustedPeople, { name: '', relation: '', phone: '' }])}
        >
          + Dodaj osobę
        </button>
      </fieldset>

      <fieldset className="safety-plan-form-group">
        <legend>Kontakt do terapeuty lub lekarza</legend>
        <p className="safety-plan-form-hint">{HINTS.contact}</p>
        <div className="auth-field">
          <label htmlFor="contact-name">Imię i nazwisko lub nazwa miejsca</label>
          <input
            id="contact-name"
            value={form.contact.name}
            maxLength={100}
            onChange={(event) => set('contact', { ...form.contact, name: event.target.value })}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="contact-role">Kim jest</label>
          <input
            id="contact-role"
            value={form.contact.role}
            maxLength={100}
            placeholder="np. psychiatra, lekarz rodzinny"
            onChange={(event) => set('contact', { ...form.contact, role: event.target.value })}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="contact-phone">Telefon</label>
          <input
            id="contact-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={form.contact.phone}
            maxLength={30}
            onChange={(event) => set('contact', { ...form.contact, phone: event.target.value })}
          />
        </div>
      </fieldset>

      <div className="auth-field">
        <label htmlFor="plan-notes">Co jeszcze warto pamiętać</label>
        <textarea
          id="plan-notes"
          rows={4}
          maxLength={2000}
          value={form.notes}
          aria-describedby="plan-notes-hint"
          onChange={(event) => set('notes', event.target.value)}
        />
        <span className="safety-plan-form-hint" id="plan-notes-hint">
          {HINTS.notes}
        </span>
      </div>

      {error && (
        <p className="auth-submit-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={saving}>
        {saving ? 'Zapisywanie…' : 'Zapisz plan'}
      </button>
      <button type="button" className="auth-submit auth-submit-secondary" onClick={onCancel} disabled={saving}>
        Anuluj
      </button>
    </form>
  )
}

export default SafetyPlanForm
