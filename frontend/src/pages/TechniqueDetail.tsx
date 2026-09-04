import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import TechniqueStepList from '../components/TechniqueStepList'
import { useStoredTechniques } from '../hooks/useStoredTechniques'
import type { TechniqueSchool } from '../types/technique'
import {
  DBT_GROUPS,
  DBT_MODULE_LABELS,
  SCHOOL_BADGES,
  badgeSchool,
  findTechnique,
  isTechniqueSchool,
  techniquesListPath,
} from '../utils/techniques'
import { ROUTES } from '../routes'
import './journals.css'
import './journalDetail.css'
import './techniques.css'
// The header badge below is .technique-badge, which lives here — imported
// explicitly rather than left to arrive as a side effect of TechniqueStepList's
// own import, or removing that section would strip the badge's styling.
import '../components/techniqueCatalogue.css'

/**
 * One technique, read-only — the catalogue has nothing to save.
 *
 * The text is transcribed from `markdown/techniki-dbt.md`; see the header of
 * `data/techniques.ts` before editing any of it.
 */

/** The tab this technique was opened from, so "wróć" leads back to it. */
function schoolFromState(state: unknown): TechniqueSchool | undefined {
  const value = (state as { szkola?: unknown } | null)?.szkola
  return typeof value === 'string' && isTechniqueSchool(value) ? value : undefined
}

function TechniqueDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  // The database half of the catalogue, so a technique a specialist wrote opens
  // from its own URL too — not only from the row that was tapped. `loading` is
  // what keeps a shared link from flashing "nie znaleziono" before the request
  // lands: a built-in technique is found on the first render regardless.
  const { techniques: stored, loading: storedLoading } = useStoredTechniques()
  const technique = findTechnique(id, stored)
  // Arrives with the row that was tapped. Absent on a reload or a shared link,
  // in which case the technique's own first tag decides the badge.
  const from = schoolFromState(useLocation().state)

  if (!technique) {
    // Still asking. "Nie znaleziono" here would be a false statement about a
    // technique that is about to appear, on the one screen a specialist would
    // reach by opening a link they just sent somebody.
    if (storedLoading) {
      return (
        <div className="journal-detail-page">
          <p className="journal-detail-not-found" role="status" aria-busy="true">
            Wczytywanie techniki…
          </p>
        </div>
      )
    }
    return (
      <div className="journal-detail-page">
        <p className="journal-detail-not-found">Nie znaleziono takiej techniki.</p>
        <Link to={ROUTES.techniques}>← Wróć do listy technik</Link>
      </div>
    )
  }

  const school = badgeSchool(technique, from)
  const backTo = techniquesListPath(school)
  const group = DBT_GROUPS.find((entry) => entry.group === technique.grupa)

  return (
    <div className="journal-detail-page">
      <header className="journal-detail-header">
        <button
          type="button"
          className="journal-detail-back"
          aria-label="Wróć do listy technik"
          onClick={() => navigate(backTo)}
        >
          ←
        </button>
        <div className="journal-detail-header-titles">
          <p className="journal-detail-module-label">PSYCHOTERAPIA</p>
          {/* Badge above the name, as in the mockup — and no duration next to
              it: the client's materials give none (see Technique.czasTrwaniaMin). */}
          <p className="technique-detail-badges">
            <span className="technique-badge">{SCHOOL_BADGES[school]}</span>
            {group && <span className="technique-detail-group">{group.label}</span>}
          </p>
          <h1>{technique.nazwa}</h1>
          {technique.modulDBT && (
            // The module name the patient's therapist uses, so the group name
            // this app invented does not leave them matching two vocabularies.
            <p className="journal-detail-date technique-detail-module">
              Moduł DBT: {DBT_MODULE_LABELS[technique.modulDBT]}
            </p>
          )}
        </div>
        <HeaderMenu />
      </header>

      <section className="journal-detail-card">
        <h2>Wprowadzenie</h2>
        <p className="technique-detail-intro">{technique.wprowadzenie}</p>
      </section>

      <section className="journal-detail-card">
        <h2>Jak to zrobić</h2>
        <TechniqueStepList steps={technique.kroki} />
      </section>

      {/* TODO: this is where rating the technique would go — and it is left out
          on purpose, not forgotten.
          The mockup puts three buttons here ("Pomogło / Trochę / Nie tym razem"),
          but that three-way shape exists only in the mockup. In the client's own
          materials the rating looks different: the exercise cards ask yes/no plus
          why, and TIPP additionally asks for emotional arousal on a 1-100 scale
          before and after. Building the mockup's version would mean picking the
          one variant the client never proposed.
          It is also part of a bigger open question: whether the app gets a skills
          practice module (the patient picks a skill for the week and records
          whether they used it) or stays a catalogue to read. Putting buttons here
          now would quietly answer that.
          Blocked on: the client's decision. Blocks: the "Skuteczność technik"
          section of the weekly report (raport.technique_efficiency is the column
          waiting for it) — see the TODO in pages/ReportDetail.tsx. */}

      <section className="journal-detail-info-banner">
        <span className="journal-detail-info-icon" aria-hidden="true">
          ⓘ
        </span>
        <p>
          Opisy są materiałem do czytania i nie zastępują kontaktu ze specjalistą. Jeśli chcesz
          wprowadzić którąś z technik na stałe, omów ją na sesji.
        </p>
      </section>

      <Link to={backTo} className="technique-detail-back-link">
        Wróć do listy technik
      </Link>
    </div>
  )
}

export default TechniqueDetail
