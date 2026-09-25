import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import { auditActionLabel, fetchAuditLog, type AuditEntry } from '../api/admin'
import { usePagination } from '../hooks/usePagination'
import { adminAccountPath, ROUTES } from '../routes'
import './journals.css'
import '../styles/panel.css'
import './specialist.css'
import './admin.css'

const LOAD_ERROR = 'Nie udało się wczytać dziennika działań. Spróbuj ponownie.'

function momentLabel(iso: string | null): string {
  if (!iso) return '—'
  const moment = new Date(iso)
  if (Number.isNaN(moment.getTime())) return iso
  return moment.toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * "Dziennik działań" — what each administrator looked at and decided.
 *
 * The answer to "who has seen this person's account" (RODO art. 5(2)). Newest
 * first, the last entries the backend keeps on one screen
 * (`AUDIT_LOG_LIMIT`). A rejected specialist's entry keeps their name as
 * text — the account itself is gone, so its link leads to "nie ma takiego
 * konta", which is the truth.
 *
 * Reading this screen is not itself logged; see `AdminAuditLogView`.
 */
function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const pages = usePagination(entries)

  useEffect(() => {
    let cancelled = false
    fetchAuditLog()
      .then((rows) => {
        if (cancelled) return
        setEntries(rows)
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

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL ADMINISTRATORA</p>
          <h1>Dziennik działań</h1>
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
        <section className="specialist-list" aria-label="Wpisy dziennika">
          {entries.length === 0 ? (
            <p className="panel-empty">Dziennik jest jeszcze pusty.</p>
          ) : (
            pages.items.map((entry) => (
              <article key={entry.id} className="specialist-list-row">
                <div>
                  <p className="specialist-list-title">{auditActionLabel(entry.action)}</p>
                  {entry.targetLabel && (
                    <p className="specialist-list-meta">
                      Konto:{' '}
                      {entry.targetId ? (
                        <Link className="admin-name-link" to={adminAccountPath(entry.targetId)}>
                          {entry.targetLabel}
                        </Link>
                      ) : (
                        entry.targetLabel
                      )}
                    </p>
                  )}
                  <p className="specialist-list-meta">
                    {entry.adminEmail} · {momentLabel(entry.createdAt)}
                  </p>
                </div>
              </article>
            ))
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
      )}
    </div>
  )
}

export default AdminAuditLog
