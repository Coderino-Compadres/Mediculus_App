import { useState, type FormEvent } from 'react'
import FormField from './FormField'
import { ApiError } from '../api/client'
import { deleteAccount, personLabel, type AccountDetail } from '../api/admin'
import './auth.css'

const DELETE_ERROR = 'Nie udało się usunąć konta. Spróbuj ponownie.'

/** What else goes with this account, in the words the confirmation shows. */
function consequences(account: AccountDetail): string[] {
  const { patient, specialist, guardian } = account
  if (patient) {
    return [
      'Konto i dane osobowe pacjenta.',
      'Wszystkie dane medyczne pacjenta: dzienniczki, raporty, posiłki, nawodnienie, ' +
        'suplementy i leki, aktywność, sen i profil zdrowotny.',
      'Powiązania ze specjalistami i opiekunami — ich konta zostają.',
    ]
  }
  if (specialist) {
    return [
      'Konto specjalisty.',
      `Powiązania z pacjentami (liczba: ${specialist.patients.length}). Ich dane zostają nietknięte.`,
      'Opublikowane przez niego techniki zostają w katalogu, bez autora.',
    ]
  }
  if (guardian) {
    return [
      'Konto opiekuna.',
      `Powiązania z dziećmi (liczba: ${guardian.children.length}). Dziecko, dla którego był to ` +
        'jedyny zatwierdzony opiekun, zostanie zablokowane, dopóki nowy opiekun nie ' +
        'zaakceptuje prośby (RODO art. 8).',
    ]
  }
  if (account.kind === 'admin') {
    return [
      'Konto administratora i jego dostęp do panelu.',
      'Wpisy w dzienniku działań zostają, z jego adresem e-mail.',
    ]
  }
  return ['Konto.']
}

interface AdminAccountDeleteProps {
  account: AccountDetail
  onDeleted: () => void
}

/**
 * "Usuń konto" on the administrator's account screen.
 *
 * Two steps, and the second asks for the account's address typed out. For a
 * patient this deletes every record in medical_db too, with no undo anywhere —
 * the backend has no soft delete — so a click that lands on the wrong row of
 * the list must not be enough. The list above the field says what goes — by
 * kind of record, never with a patient's own counts, which the panel does not
 * see.
 *
 * Never drawn for the signed-in administrator's own account; the backend
 * refuses it regardless (core/admin_panel.py `OwnAccount`).
 */
function AdminAccountDelete({ account, onDeleted }: AdminAccountDeleteProps) {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The address when there is one — it is what identifies the account — and
  // the name otherwise, so an account without an address can still be deleted.
  const expected = account.email ?? personLabel(account)
  const matches = typed.trim().toLowerCase() === expected.toLowerCase()

  function cancel() {
    setConfirming(false)
    setTyped('')
    setError(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!matches) return
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(account.id)
      onDeleted()
    } catch (cause: unknown) {
      setError((cause instanceof ApiError && cause.formMessage) || DELETE_ERROR)
      setBusy(false)
    }
  }

  return (
    <section className="panel-card" aria-labelledby="admin-delete-heading">
      <h2 id="admin-delete-heading" className="panel-card-title">
        Usunięcie konta
      </h2>
      {!confirming ? (
        <button
          type="button"
          className="panel-button-secondary"
          onClick={() => setConfirming(true)}
        >
          Usuń konto
        </button>
      ) : (
        <form
          className="admin-confirm"
          aria-label="Potwierdzenie usunięcia konta"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <p className="panel-error">
            Usunięcie jest trwałe i nie da się go cofnąć. Zniknie:
          </p>
          <ul className="admin-consequences">
            {consequences(account).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <FormField
            id="confirmDelete"
            label={`Aby potwierdzić, wpisz: ${expected}`}
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={busy}
          />
          {error && (
            <p className="panel-error" role="alert">
              {error}
            </p>
          )}
          <div className="specialist-list-actions">
            <button
              type="submit"
              className="panel-button admin-danger"
              disabled={busy || !matches}
            >
              {busy ? 'Usuwanie…' : 'Usuń konto na stałe'}
            </button>
            <button type="button" className="panel-button-quiet" disabled={busy} onClick={cancel}>
              Anuluj
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

export default AdminAccountDelete
