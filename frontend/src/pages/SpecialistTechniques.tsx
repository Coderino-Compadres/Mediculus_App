import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import { deleteTechnique, fetchMyTechniques, type StoredTechnique } from '../api/techniques'
import { SCHOOL_BADGES } from '../utils/techniques'
import { ROUTES, specialistTechniqueEditPath, techniqueDetailPath } from '../routes'
import './journals.css'
import './specialist.css'

/**
 * "Moje techniki" — what this specialist has written into the catalogue.
 *
 * SAVED MEANS PUBLISHED. There is no draft state: the form's "Gotowa do
 * publikacji" checkbox was removed on request, so everything listed here is in
 * every patient's catalogue right now. That is why the rows carry no status of
 * any kind — a badge that always said the same thing would be noise, and one
 * that sometimes said something else would be describing a state the panel
 * cannot produce.
 *
 * EVERY PATIENT, not only this specialist's, and the screen says so rather than
 * leaving it to be discovered. That was the decision behind the feature; the
 * alternative (a per-patient catalogue) would need an assignment table that does
 * not exist.
 *
 * Only the author's own techniques are listed and only they can be edited —
 * `find_for_specjalist` filters on `author_id_specjalist`, so a colleague's
 * technique answers like a nonexistent one. Correcting somebody else's clinical
 * wording is a conversation, not a form.
 */

const LOAD_ERROR = 'Nie udało się wczytać Twoich technik. Spróbuj ponownie.'
const DELETE_ERROR = 'Nie udało się usunąć techniki. Spróbuj ponownie.'

function SpecialistTechniques() {
  const [techniques, setTechniques] = useState<StoredTechnique[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchMyTechniques()
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

  async function remove(technique: StoredTechnique) {
    setBusyId(technique.idTechnique)
    setActionError(null)
    try {
      await deleteTechnique(technique.idTechnique)
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
          <h1>Moje techniki</h1>
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistHome}>
        ← Wróć do panelu
      </Link>

      <p className="reports-intro">
        Każda dodana tu technika trafia do katalogu „Techniki terapeutyczne” i
        jest widoczna dla wszystkich pacjentów aplikacji. Jeśli chcesz ją
        wycofać, usuń ją.
      </p>

      <Link className="specialist-form-submit specialist-new-link" to={ROUTES.specialistTechniqueNew}>
        Dodaj technikę
      </Link>

      {loading && (
        <div className="journals-status" role="status" aria-busy="true">
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
        <p className="caseload-error" role="alert">
          {actionError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="specialist-list">
          {techniques.length === 0 && (
            <p className="journals-empty">
              Nie dodałeś jeszcze żadnej techniki.
            </p>
          )}
          {techniques.map((technique) => (
            <article key={technique.idTechnique} className="specialist-list-row">
              <div>
                <p className="specialist-list-title">{technique.nazwa}</p>
                <p className="specialist-list-meta">
                  {technique.szkola.map((school) => SCHOOL_BADGES[school]).join(' · ')}
                  {' · '}
                  {technique.kroki.length === 1 ? '1 krok' : `${technique.kroki.length} kroki`}
                </p>
                <p className="specialist-list-meta">/{technique.id}</p>
              </div>
              <div className="specialist-list-actions">
                {/* Always available now: everything here is published, so the
                    catalogue can always open it. */}
                <Link className="caseload-card-link" to={techniqueDetailPath(technique.id)}>
                  Podgląd
                </Link>
                <Link
                  className="caseload-card-link"
                  to={specialistTechniqueEditPath(technique.idTechnique)}
                >
                  Edytuj
                </Link>
                {confirmId === technique.idTechnique ? (
                  <>
                    <button
                      type="button"
                      className="caseload-card-drop"
                      onClick={() => void remove(technique)}
                      disabled={busyId === technique.idTechnique}
                    >
                      Usuń na pewno
                    </button>
                    <button
                      type="button"
                      className="caseload-card-link"
                      onClick={() => setConfirmId(null)}
                    >
                      Nie usuwaj
                    </button>
                  </>
                ) : (
                  /* Two taps, because this is content patients may be using
                     between sessions and there is no undo. */
                  <button
                    type="button"
                    className="caseload-card-drop"
                    onClick={() => setConfirmId(technique.idTechnique)}
                  >
                    Usuń
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default SpecialistTechniques
