import { useState, type ChangeEvent, type FormEvent } from 'react'
import FormField from './FormField'
import SelectField from './SelectField'
import { ApiError } from '../api/client'
import { toFormErrors } from '../api/auth'
import {
  ACCOUNT_EDIT_FIELDS,
  updateAccount,
  type AccountChanges,
  type AccountDetail,
} from '../api/admin'
import { isAppModule, MODULE_LABELS, MODULES } from '../utils/modules'
import './auth.css'

const SAVE_ERROR = 'Nie udało się zapisać zmian. Spróbuj ponownie.'

const MODULE_OPTIONS = MODULES.map((module) => ({ value: module, label: MODULE_LABELS[module] }))

type Values = Record<keyof AccountChanges, string>

/** The form as the account stands now; '' for anything the account lacks. */
function valuesOf(account: AccountDetail): Values {
  const specialist = account.specialist
  return {
    firstName: account.name ?? '',
    lastName: account.surname ?? '',
    email: account.email ?? '',
    dateOfBirth: account.dateOfBirth ?? '',
    specialization: specialist?.specialization ?? '',
    university: specialist?.qualifications.university ?? '',
    fieldOfStudy: specialist?.qualifications.fieldOfStudy ?? '',
    diplomaNumber: specialist?.qualifications.diplomaNumber ?? '',
    module: specialist?.module ?? '',
  }
}

const IDENTITY_KEYS = ['firstName', 'lastName', 'email', 'dateOfBirth'] as const
const SPECIALIST_KEYS = [
  'specialization', 'university', 'fieldOfStudy', 'diplomaNumber', 'module',
] as const

/**
 * Only what differs from the account as loaded, trimmed. Sending the whole
 * form would overwrite a field another administrator corrected a minute ago
 * with the value this screen loaded before they did.
 */
function changesBetween(before: Values, after: Values, isSpecialist: boolean): AccountChanges {
  const keys = isSpecialist ? [...IDENTITY_KEYS, ...SPECIALIST_KEYS] : IDENTITY_KEYS
  const changes: AccountChanges = {}
  for (const key of keys) {
    const value = after[key].trim()
    if (value === before[key].trim()) continue
    if (key === 'module') {
      if (isAppModule(value)) changes.module = value
    } else {
      changes[key] = value
    }
  }
  return changes
}

interface AdminAccountEditProps {
  account: AccountDetail
  onSaved: (account: AccountDetail) => void
}

/**
 * "Zmień dane konta" on the administrator's account screen — for a specialist's
 * account only: their identity (name, surname, address, date of birth) and
 * their professional details. A patient's, a guardian's or an administrator's
 * data is not the panel's to change; the caller draws this for specialists and
 * the backend refuses anything else (core/admin_panel.py `NotEditable`).
 *
 * The backend holds every rule (core/serializers.py
 * `AdminAccountEditSerializer`): an address somebody else has, a specialist
 * made a minor, a blank diploma number. This form only shows its answers where
 * they belong.
 */
function AdminAccountEdit({ account, onSaved }: AdminAccountEditProps) {
  const isSpecialist = account.specialist !== null
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(() => valuesOf(account))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const changes = changesBetween(valuesOf(account), values, isSpecialist)
  const changed = Object.keys(changes).length > 0

  function change(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  function toggle() {
    // Reopening starts from the account as it is now, not from a half-typed
    // edit that was abandoned.
    if (!open) {
      setValues(valuesOf(account))
      setErrors({})
      setFormError(null)
    }
    setNotice(null)
    setOpen((value) => !value)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!changed) return
    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const saved = await updateAccount(account.id, changes)
      onSaved(saved)
      setOpen(false)
      setNotice(
        changes.email !== undefined
          ? 'Zapisano zmiany. Adres e-mail się zmienił, więc konto zostało wylogowane ze wszystkich urządzeń.'
          : 'Zapisano zmiany.',
      )
    } catch (cause: unknown) {
      if (cause instanceof ApiError) {
        setErrors(toFormErrors(cause.fieldErrors, ACCOUNT_EDIT_FIELDS) as Record<string, string>)
        setFormError(
          cause.formMessage ?? (Object.keys(cause.fieldErrors).length ? null : SAVE_ERROR),
        )
      } else {
        setFormError(SAVE_ERROR)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel-card" aria-labelledby="admin-edit-heading">
      <h2 id="admin-edit-heading" className="panel-card-title">
        Zmiana danych
      </h2>
      {notice && (
        <p className="panel-success" role="status">
          {notice}
        </p>
      )}
      {!open && (
        <button type="button" className="panel-button-secondary" onClick={toggle}>
          Zmień dane konta
        </button>
      )}
      {open && (
        <form className="specialist-form" onSubmit={(event) => void submit(event)} noValidate>
          <FormField
            id="firstName" label="Imię" type="text" autoComplete="off"
            value={values.firstName} onChange={change} error={errors.firstName} disabled={saving}
          />
          <FormField
            id="lastName" label="Nazwisko" type="text" autoComplete="off"
            value={values.lastName} onChange={change} error={errors.lastName} disabled={saving}
          />
          <FormField
            id="email" label="Adres e-mail" type="email" autoComplete="off"
            value={values.email} onChange={change} error={errors.email} disabled={saving}
          />
          <FormField
            id="dateOfBirth" label="Data urodzenia" type="date" autoComplete="off"
            value={values.dateOfBirth} onChange={change} error={errors.dateOfBirth}
            disabled={saving}
          />
          {isSpecialist && (
            <>
              <FormField
                id="specialization" label="Specjalizacja" type="text" autoComplete="off"
                value={values.specialization} onChange={change} error={errors.specialization}
                disabled={saving}
              />
              <FormField
                id="university" label="Uczelnia" type="text" autoComplete="off"
                value={values.university} onChange={change} error={errors.university}
                disabled={saving}
              />
              <FormField
                id="fieldOfStudy" label="Kierunek studiów" type="text" autoComplete="off"
                value={values.fieldOfStudy} onChange={change} error={errors.fieldOfStudy}
                disabled={saving}
              />
              <FormField
                id="diplomaNumber" label="Numer dyplomu" type="text" autoComplete="off"
                maxLength={50} value={values.diplomaNumber} onChange={change}
                error={errors.diplomaNumber} disabled={saving}
              />
              {/* Which panel the specialist sees — never which patients: that
                  is still one accepted invitation per module. */}
              <SelectField
                id="module" label="Moduł" options={MODULE_OPTIONS}
                placeholder={values.module ? undefined : 'Wybierz moduł'}
                value={values.module} onChange={change} error={errors.module || null}
                disabled={saving}
              />
            </>
          )}
          {formError && (
            <p className="panel-error" role="alert">
              {formError}
            </p>
          )}
          <div className="specialist-list-actions">
            <button type="submit" className="panel-button" disabled={saving || !changed}>
              {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </button>
            <button type="button" className="panel-button-quiet" disabled={saving} onClick={toggle}>
              Anuluj
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

export default AdminAccountEdit
