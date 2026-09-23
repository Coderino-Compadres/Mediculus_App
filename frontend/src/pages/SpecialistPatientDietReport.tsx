import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoadError from '../components/LoadError'
import { ApiError } from '../api/client'
import {
  fetchCaseload,
  fetchPatientDietReport,
  fetchPatientDietReportPdf,
} from '../api/specialist'
import { saveBlob } from '../api/reports'
import { patientLabel } from '../utils/specialist'
import { MODULE_DIET } from '../utils/modules'
import type { DietWeeklyReport } from '../types/dietReport'
import { dietReportPdfFileName } from '../utils/dietReport'
import { DietReportBody } from './DietReportDetail'
import { ROUTES, specialistPatientDietReportsPath } from '../routes'
import './dietReport.css'
import '../styles/panel.css'

/**
 * One diet report, read by the patient's psychodietitian.
 *
 * **IT RENDERS `DietReportBody`, WHICH IS THE PATIENT'S OWN SCREEN**, rather
 * than a second layout of the same payload. That is the rule the psychotherapy
 * module already follows and the reason the aggregation lives on the server: a
 * specialist and a patient discussing a week must be looking at one document,
 * down to the wording. What this screen adds is the frame — whose week it is,
 * the way back to the caseload, and the PDF fetched from the specialist's own
 * URL.
 *
 * A patient this specialist does not treat **in the diet module** answers 404,
 * exactly like one who does not exist: a psychotherapist holding the link gets
 * the same answer as a stranger.
 */

const LOAD_ERROR = 'Nie udało się wczytać raportu pacjenta. Spróbuj ponownie.'
const NOT_MINE =
  'Nie prowadzisz tego pacjenta w module dietetycznym albo raport nie istnieje.'
const PDF_ERROR = 'Nie udało się pobrać raportu. Spróbuj ponownie.'

function SpecialistPatientDietReport() {
  const { patientId, reportId } = useParams<{ patientId: string; reportId: string }>()

  const [report, setReport] = useState<DietWeeklyReport | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notMine, setNotMine] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const backTo = specialistPatientDietReportsPath(patientId ?? '')

  useEffect(() => {
    if (!patientId || !reportId) return
    let cancelled = false

    fetchPatientDietReport(patientId, reportId)
      .then((loaded) => {
        if (cancelled) return
        setReport(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // A week that does not exist and a patient who is not this
        // specialist's answer the same way, on purpose — see the module header
        // of core/specialist.py. Neither offers a retry, because retrying
        // answers the same.
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
  }, [patientId, reportId, attempt])

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

  async function downloadPdf(current: DietWeeklyReport) {
    if (!patientId) return
    setDownloading(true)
    setPdfError(null)
    try {
      saveBlob(
        await fetchPatientDietReportPdf(patientId, current.id),
        dietReportPdfFileName(current),
      )
    } catch (cause: unknown) {
      setPdfError((cause instanceof ApiError && cause.formMessage) || PDF_ERROR)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="diet-report-page">
        <p className="diet-report-not-found" role="status" aria-busy="true">
          Wczytywanie raportu…
        </p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="diet-report-page">
        <LoadError
          className="diet-report-not-found"
          message={loadError}
          onRetry={() => {
            setLoading(true)
            setLoadError(null)
            setAttempt((value) => value + 1)
          }}
        />
        <Link className="diet-report-back-link" to={backTo}>
          ← Wróć do raportów pacjenta
        </Link>
      </div>
    )
  }

  if (notMine || !report) {
    return (
      <div className="diet-report-page">
        <p className="diet-report-not-found">{NOT_MINE}</p>
        <Link className="diet-report-back-link" to={ROUTES.specialistHome}>
          ← Wróć do panelu
        </Link>
      </div>
    )
  }

  return (
    <DietReportBody
      report={report}
      backTo={backTo}
      subtitle={name}
      readerIsSubject={false}
      onDownload={() => void downloadPdf(report)}
      downloading={downloading}
      downloadError={pdfError}
    />
  )
}

export default SpecialistPatientDietReport
