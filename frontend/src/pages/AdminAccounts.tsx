import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KIND_PLURALS,
  ACCOUNT_KINDS,
  accountFlags,
  fetchAccounts,
  personLabel,
  type AccountKind,
  type AccountRow,
} from '../api/admin'
import { usePagination } from '../hooks/usePagination'
import { linkedSinceLabel } from '../utils/children'
import { adminAccountPath, ROUTES } from '../routes'
import './journals.css'
import '../styles/panel.css'
import './specialist.css'
import './admin.css'

const LOAD_ERROR = 'Nie udało się wczytać listy kont. Spróbuj ponownie.'

/**
 * "Konta w bazie" — every account in user_db, read-only.
 *
 * Fetched once and filtered here, by kind and by a search over name and
 * address: the list is people rather than events, so it stays small, and one
 * request is one entry in the audit log rather than one per chip clicked.
 * Paginated like every other list (hooks/usePagination.ts); changing a filter
 * sends the list back to page one, where the first match is.
 *
 * Nothing on this screen changes anything. An account's detail is one click
 * further in, and opening it is what the audit log records by name.
 */
function AdminAccounts() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [kind, setKind] = useState<AccountKind | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAccounts()
      .then((rows) => {
        if (cancelled) return
        setAccounts(rows)
        setLoadError(null)
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
  }, [attempt])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pl-PL')
    return accounts.filter((row) => {
      if (kind && row.kind !== kind) return false
      if (!needle) return true
      return [row.name, row.surname, row.email]
        .filter(Boolean)
        .some((value) => (value as string).toLocaleLowerCase('pl-PL').includes(needle))
    })
  }, [accounts, kind, query])

  const pages = usePagination(filtered)
  // Only the kinds that exist, so there is no chip leading to an empty list.
  const presentKinds = ACCOUNT_KINDS.filter((value) => accounts.some((row) => row.kind === value))

  function chooseKind(next: AccountKind | null) {
    setKind(next)
    pages.reset()
  }

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL ADMINISTRATORA</p>
          <h1>Konta w bazie</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.adminHome}>
        ← Wróć do panelu
      </Link>

      {loading && (
        <div className="panel-loading" role="status" aria-busy="true">
          Wczytywanie…
        </div>
      )}

      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      )}

      {!loading && !loadError && (
        <>
          <div className="journals-filters" role="group" aria-label="Rodzaj konta">
            <button
              type="button"
              className={`journals-filter-chip${kind === null ? ' journals-filter-chip-active' : ''}`}
              aria-pressed={kind === null}
              onClick={() => chooseKind(null)}
            >
              Wszystkie ({accounts.length})
            </button>
            {presentKinds.map((value) => (
              <button
                key={value}
                type="button"
                className={`journals-filter-chip${kind === value ? ' journals-filter-chip-active' : ''}`}
                aria-pressed={kind === value}
                onClick={() => chooseKind(value)}
              >
                {ACCOUNT_KIND_PLURALS[value]} ({accounts.filter((row) => row.kind === value).length})
              </button>
            ))}
          </div>

          <div className="admin-search">
            <label htmlFor="admin-search">Szukaj po imieniu, nazwisku lub adresie e-mail</label>
            <input
              id="admin-search"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                pages.reset()
              }}
            />
          </div>

          <section className="specialist-list" aria-label="Lista kont">
            {filtered.length === 0 ? (
              <p className="panel-empty">
                {accounts.length === 0
                  ? 'W bazie nie ma jeszcze żadnych kont.'
                  : 'Żadne konto nie pasuje do wybranych filtrów.'}
              </p>
            ) : (
              pages.items.map((row) => {
                const flags = accountFlags(row)
                const created = linkedSinceLabel(row.createdAt)
                return (
                  <article key={row.id} className="specialist-list-row">
                    <div>
                      <p className="specialist-list-title">
                        <Link className="admin-name-link" to={adminAccountPath(row.id)}>
                          {personLabel(row)}
                        </Link>
                      </p>
                      <p className="specialist-list-meta">{row.email}</p>
                      <p className="specialist-list-meta">
                        {ACCOUNT_KIND_LABELS[row.kind]}
                        {created && ` · utworzone ${created}`}
                      </p>
                      {flags.length > 0 && (
                        <p className="admin-flags">
                          {flags.map((flag) => (
                            <span key={flag} className="admin-flag">
                              {flag}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </article>
                )
              })
            )}
            <Pagination
              page={pages.page}
              pageCount={pages.pageCount}
              from={pages.from}
              to={pages.to}
              total={pages.total}
              onChange={pages.goTo}
              unit="kont"
            />
          </section>

          <p className="panel-note">
            Lista pokazuje dane kont z bazy tożsamości. Treść dzienniczków
            i raportów nie jest dostępna w panelu administratora.
          </p>
        </>
      )}
    </div>
  )
}

export default AdminAccounts
