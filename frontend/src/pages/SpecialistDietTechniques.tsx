import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import {
  deleteDietTechnique,
  fetchMyDietTechniques,
  type StoredDietTechnique,
} from '../api/dietTechniques'
import { usePagination } from '../hooks/usePagination'
import {
  ROUTES,
  dietTechniqueDetailPath,
  specialistDietTechniqueEditPath,
} from '../routes'
import './journals.css'
import '../styles/panel.css'
import './specialist.css'

/**
 * "Moje techniki psychodietetyczne" — what this psychodietitian has written into
 * the diet module's catalogue.
 *
 * The diet module's `SpecialistTechniques`, and the same decisions hold: saved
 * means published (no draft, so no status on a row), every patient sees it, only
 * the author's own techniques are listed and editable, seven rows a page, and
 * deleting takes two taps. See that file for the reasoning behind each.
 */

const LOAD_ERROR = 'Nie udało się wczytać Twoich technik. Spróbuj ponownie.'
const DELETE_ERROR = 'Nie udało się usunąć techniki. Spróbuj ponownie.'

function stepCount(count: number): string {
  if (count === 1) return '1 krok'
  const lastTwo = count % 100
  const last = count % 10
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? `${count} kroki`
    : `${count} kroków`
}

function SpecialistDietTechniques() {
  const [techniques, setTechniques] = useState<StoredDietTechnique[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const pages = usePagination(techniques)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchMyDietTechniques()
      .then((loaded) => {
        if (cancelled) return
        setTechniques(loaded)
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

  async function remove(technique: StoredDietTechnique) {
    setBusyId(technique.idTechnique)
    setActionError(null)
    try {
      await deleteDietTechnique(technique.idTechnique)
      setTechniques((current) =>
        current.filter((entry) => entry.idTechnique !== technique.idTechnique),
      )
      setConfirmId(null)
    } catch {
      setActionError(DELETE_ERROR)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PANEL SPECJALISTY</p>
          <h1>Moje techniki psychodietetyczne</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistHome}>
        ← Wróć do panelu
      </Link>

      <p className="reports-intro">
        Każda dodana tu technika trafia do katalogu „Techniki psychodietetyczne”
        i jest widoczna dla wszystkich pacjentów aplikacji. Jeśli chcesz ją
        wycofać, usuń ją.
      </p>

      <Link className="panel-button specialist-new-link" to={ROUTES.specialistDietTechniqueNew}>
        Dodaj technikę
      </Link>

      {loading && (
        <div className="panel-loading" role="status" aria-busy="true">
          Wczytywanie technik…
        </div>
      )}

      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {actionError && (
        <p className="panel-error" role="alert">
          {actionError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="specialist-list">
          {techniques.length === 0 && (
            <p className="panel-empty">Nie dodałeś jeszcze żadnej techniki.</p>
          )}
          {pages.items.map((technique) => (
            <article key={technique.idTechnique} className="specialist-list-row">
              <div>
                <p className="specialist-list-title">{technique.nazwa}</p>
                <p className="specialist-list-meta">
                  {[technique.czasTrwania, technique.momentZastosowania, stepCount(technique.kroki.length)]
                    .filter((part): part is string => part !== undefined)
                    .join(' · ')}
                </p>
                <p className="specialist-list-meta">/{technique.id}</p>
              </div>
              <div className="specialist-list-actions">
                <Link className="panel-link" to={dietTechniqueDetailPath(technique.id)}>
                  Podgląd
                </Link>
                <Link
                  className="panel-link"
                  to={specialistDietTechniqueEditPath(technique.idTechnique)}
                >
                  Edytuj
                </Link>
                {confirmId === technique.idTechnique ? (
                  <>
                    <button
                      type="button"
                      className="panel-button-quiet"
                      onClick={() => void remove(technique)}
                      disabled={busyId === technique.idTechnique}
                    >
                      Usuń na pewno
                    </button>
                    <button
                      type="button"
                      className="panel-link"
                      onClick={() => setConfirmId(null)}
                    >
                      Nie usuwaj
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="panel-button-quiet"
                    onClick={() => setConfirmId(technique.idTechnique)}
                  >
                    Usuń
                  </button>
                )}
              </div>
            </article>
          ))}
          <Pagination
            page={pages.page}
            pageCount={pages.pageCount}
            from={pages.from}
            to={pages.to}
            total={pages.total}
            onChange={pages.goTo}
            unit="technik"
          />
        </div>
      )}
    </div>
  )
}

export default SpecialistDietTechniques
