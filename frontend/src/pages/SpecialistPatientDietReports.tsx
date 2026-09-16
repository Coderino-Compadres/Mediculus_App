import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HeaderMenu from '../components/HeaderMenu'
import LoadError from '../components/LoadError'
import Pagination from '../components/Pagination'
import { ApiError } from '../api/client'
import { fetchCaseload, fetchPatientDietReports } from '../api/specialist'
import { patientLabel } from '../utils/specialist'
import { usePagination } from '../hooks/usePagination'
import { pluralDays } from '../utils/reports'
import { pluralMeals } from '../utils/meals'
import { MODULE_DIET } from '../utils/modules'
import type { DietWeeklyReport } from '../types/dietReport'
import { ROUTES, specialistPatientDietReportPath } from '../routes'
import './journals.css'
import './dietReports.css'
import '../styles/panel.css'
import './specialist.css'

/**
 * One patient's **diet** reports, read by their psychodietitian.
 *
 * The same documents the patient sees on their own /diet/reports — same
 * endpoint shape, same aggregation (core/diet_reports.py), same rows — because
 * the point of a report is that the two people in the consulting room are
 * reading one paper. The only differences are the frame: whose reports these
 * are, and a way back to the caseload.
 *
 * **A SEPARATE SCREEN FROM THE PSYCHOTHERAPY ONE**, mirroring the split the
 * patient's own screens already have, and for the reason `utils/dietWeeks.ts`
 * spells out: the two modules do not agree on what a week is. A psychotherapy
 * week runs Monday to Sunday; this one runs seven days from the patient's first
 * entry. One screen holding both would be one screen with two meanings of the
 * word.
 *
 * **WHO REACHES IT.** Only a specialist whose relationship with this patient is
 * a *diet* one — `_assigned_patient(..., MODULE_DIET)` on the backend. A
 * psychotherapist treating the same person gets 404 here, exactly like a
 * stranger: the food diary is not theirs to read, and being somebody's
 * therapist is not a key to every module.
 *
 * NOTHING HERE SCORES A WEEK. The row says "5 dni z wpisem" — a plain count,
 * never "5 z 7" — for the same reason the patient's own list does: this module
 * describes eating rather than measuring it, and a fraction of seven is a
 * regularity score.
 */

const LOAD_ERROR = 'Nie udało się wczytać raportów pacjenta. Spróbuj ponownie.'
const NOT_MINE =
  'Nie prowadzisz tego pacjenta w module dietetycznym. Wróć do panelu i wybierz ' +
  'pacjenta z listy.'

function ReportRow({ report, onOpen }: { report: DietWeeklyReport; onOpen: () => void }) {
  const meals = report.days.reduce((total, day) => total + day.meals.length, 0)

  return (
    <button type="button" className="report-row" onClick={onOpen}>
      <span className="report-row-badge" aria-hidden="true">
        🍽️
      </span>
      <div className="journal-row-body">
        <div className="journal-row-top">
          <span className="journal-row-date">{report.rangeLabel}</span>
        </div>
        <p className="journal-row-preview">
          {/* Two counts and no verdict: how many days were written on, and how
              many meals they hold. Neither is a fraction of anything, and
              nothing here says whether the week was good. */}
          {report.daysWithEntry} {pluralDays(report.daysWithEntry)} z wpisem ·{' '}
          {pluralMeals(meals)}
        </p>
      </div>
      <span className="journal-row-arrow" aria-hidden="true">
        →
      </span>
    </button>
  )
}

function SpecialistPatientDietReports() {
  const navigate = useNavigate()
  const { patientId } = useParams<{ patientId: string }>()

  const [reports, setReports] = useState<DietWeeklyReport[]>([])
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // A 404 is an answer rather than a failure: this is not your patient in this
  // module. Kept apart from `loadError` because "Spróbuj ponownie" is the wrong
  // offer for a state retrying cannot change.
  const [notMine, setNotMine] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((value) => value + 1)
  const pages = usePagination(reports)

  useEffect(() => {
    if (!patientId) return
    let cancelled = false

    fetchPatientDietReports(patientId)
      .then((loaded) => {
        if (cancelled) return
        setReports(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 404) {
          setNotMine(true)
          return
        }
        setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [patientId, attempt])

  // The heading, from the list this screen was reached from. A failure here is
  // silent on purpose: not knowing the name is no reason to withhold the
  // reports, and the id is not a name worth printing.
  useEffect(() => {
    if (!patientId) return
    let cancelled = false

    fetchCaseload()
      .then(({ patients }) => {
        const patient = patients.find(
          (entry) => entry.id === patientId && entry.module === MODULE_DIET,
        )
        if (!cancelled && patient) setName(patientLabel(patient))
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [patientId])

  return (
    <div className="journals-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">DIETETYKA I PSYCHODIETETYKA</p>
          <h1>Raporty pacjenta</h1>
          {name && <p className="journals-subtitle">{name}</p>}
        </div>
        <HeaderMenu />
      </header>

      <Link className="journals-back" to={ROUTES.specialistHome}>
        ← Wróć do panelu
      </Link>

      <p className="reports-intro">
        Raport powstaje co siedem dni, licząc od pierwszego wpisu pacjenta — nie od
        poniedziałku. Nie można go wygenerować wcześniej ani zmienić zakresu.
      </p>

      {loading && (
        <div className="panel-loading" role="status" aria-busy="true">
          Wczytywanie raportów…
        </div>
      )}

      {!loading && notMine && (
        <p className="panel-empty" role="status">
          {NOT_MINE}
        </p>
      )}

      {!loading && loadError && (
        <LoadError
          className="journals-status journals-status-error"
          message={loadError}
          onRetry={retry}
        />
      )}

      {!loading && !loadError && !notMine && (
        <div className="journals-list">
          {reports.length === 0 && (
            <p className="panel-empty">
              Ten pacjent nie ma jeszcze żadnego raportu żywieniowego. Pierwszy
              powstanie siedem dni po jego pierwszym wpisie.
            </p>
          )}
          {pages.items.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              onOpen={() =>
                navigate(specialistPatientDietReportPath(patientId ?? '', report.id))
              }
            />
          ))}
        </div>
      )}

      {!loading && !loadError && !notMine && (
        <Pagination
          page={pages.page}
          pageCount={pages.pageCount}
          from={pages.from}
          to={pages.to}
          total={pages.total}
          onChange={pages.goTo}
          unit="raportów"
        />
      )}
    </div>
  )
}

export default SpecialistPatientDietReports
