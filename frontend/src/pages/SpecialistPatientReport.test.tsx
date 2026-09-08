import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import { WEEK_B, reportFixture } from '../test/reportFixture'
import SpecialistPatientReport from './SpecialistPatientReport'
import { ApiError } from '../api/client'

const PATIENT_ID = 'p0000000-0000-0000-0000-000000000001'
const navigate = vi.fn()
let routeReportId = `week-${WEEK_B}`

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ patientId: PATIENT_ID, reportId: routeReportId }),
  }
})

vi.mock('../api/specialist', () => ({
  fetchPatientReport: vi.fn(),
  fetchPatientReportPdf: vi.fn(),
}))
const { fetchPatientReport, fetchPatientReportPdf } = await import('../api/specialist')
const mockedFetch = vi.mocked(fetchPatientReport)
const mockedPdf = vi.mocked(fetchPatientReportPdf)

/**
 * One weekly report as the patient's specialist reads it.
 *
 * THE BODY IS THE PATIENT'S OWN REPORT — `components/ReportSections.tsx`, which
 * pages/ReportDetail.tsx renders too, so the two people in the consulting room
 * cannot be holding different papers. `ReportDetail.test.tsx` covers that body;
 * this file covers the frame and the **one deliberate difference**: the flagged
 * days are text here and not links, because the specialist's access is the
 * reports and nothing else, and a link into the diary entry behind a flagged day
 * would answer in markup a question still open with the client.
 *
 * The report is read through the specialist URL, which is where the "is this
 * your patient" check happens — hence the path, not just the week, is asserted.
 */

const SPECIALIST = { ...TEST_USER, isPatient: false, isSpecialist: true, role: 'specjalista' }
const RISKY_DAY = {
  date: '2026-08-11',
  notePreview: 'Alkohol wieczorem.',
  entryId: 'e0000000-0000-0000-0000-000000000001',
}

function render() {
  return renderWithProviders(<SpecialistPatientReport />, { user: SPECIALIST })
}

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
  mockedPdf.mockReset()
  routeReportId = `week-${WEEK_B}`
})

describe('the report', () => {
  it('is read for this patient and this week, through the specialist URL', async () => {
    /** The path is where the check lives: another specialist's patient answers
     *  404 on exactly this URL. */
    mockedFetch.mockResolvedValueOnce(reportFixture())
    render()

    await screen.findByRole('heading', { name: 'Raport pacjenta' })

    expect(mockedFetch).toHaveBeenCalledWith(PATIENT_ID, `week-${WEEK_B}`)
  })

  it('says whose week it is in the heading, and which week', async () => {
    mockedFetch.mockResolvedValueOnce(reportFixture())
    render()

    expect(await screen.findByRole('heading', { name: 'Raport pacjenta' })).toBeInTheDocument()
    expect(screen.getAllByText('10 – 16 sierpnia 2026').length).toBeGreaterThan(0)
    expect(screen.getByText('3 z 7 dni z wpisem')).toBeInTheDocument()
  })

  it('shows the same figures the patient sees', async () => {
    mockedFetch.mockResolvedValueOnce(reportFixture())
    render()

    await screen.findByRole('heading', { name: 'Raport pacjenta' })

    expect(screen.getByText('Średni nastrój')).toBeInTheDocument()
    expect(screen.getByText('3,0 / 5')).toBeInTheDocument()
    expect(screen.getByText('Trudniejsze dni')).toBeInTheDocument()
  })

  it('renders the risky-behaviour section even on a week that held none', async () => {
    /** "None this week" is itself a reading for a specialist, and a section
     *  that appeared only on bad weeks would announce them from the table of
     *  contents. */
    mockedFetch.mockResolvedValueOnce(reportFixture({ riskyDays: [] }))
    render()

    await screen.findByRole('heading', { name: 'Raport pacjenta' })

    expect(screen.getByRole('heading', { name: /Zachowania ryzykowne/i })).toBeInTheDocument()
  })

  it('does not link a flagged day into the diary entry behind it', async () => {
    /** THE ONE DELIBERATE DIFFERENCE from the patient's copy. Their access is
     *  the reports; whether a specialist may read the diary itself is open with
     *  the client, and a link here would settle it in markup. */
    mockedFetch.mockResolvedValueOnce(reportFixture({ riskyDays: [RISKY_DAY] }))
    render()

    await screen.findByRole('heading', { name: 'Raport pacjenta' })

    expect(screen.getByText('Alkohol wieczorem.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Alkohol/ })).toBeNull()
    expect(document.querySelector(`a[href*="${RISKY_DAY.entryId}"]`)).toBeNull()
  })

  it('offers nothing that shares the report and nothing that edits it', async () => {
    /** Dropping a link is the specialist's action, but a report is a derived
     *  document: there is nothing here to change. */
    mockedFetch.mockResolvedValueOnce(reportFixture())
    render()

    await screen.findByRole('heading', { name: 'Raport pacjenta' })

    expect(screen.queryByRole('button', { name: /wyślij|udostępnij|edytuj|zapisz/i })).toBeNull()
  })

  it('says what the report does and does not count', async () => {
    mockedFetch.mockResolvedValueOnce(reportFixture())
    render()

    await screen.findByRole('heading', { name: 'Raport pacjenta' })

    expect(screen.getByText(/Dni bez wpisu nie są liczone jako złe dni/)).toBeInTheDocument()
  })

  it('leads back to this patient\'s list rather than to the reader\'s own reports', async () => {
    mockedFetch.mockResolvedValueOnce(reportFixture())
    render()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Wróć do raportów pacjenta' }),
    )

    expect(navigate).toHaveBeenCalledWith(`/specialist/patients/${PATIENT_ID}/reports`)
  })
})

describe('the PDF', () => {
  it('is fetched for this patient and saved under the week it covers', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' })
    mockedFetch.mockResolvedValueOnce(reportFixture())
    mockedPdf.mockResolvedValueOnce(blob)
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))

    expect(mockedPdf).toHaveBeenCalledWith(PATIENT_ID, `week-${WEEK_B}`)
    expect(createUrl).toHaveBeenCalledWith(blob)
    createUrl.mockRestore()
  })

  it('says a failed download failed, and leaves the report on screen', async () => {
    mockedFetch.mockResolvedValueOnce(reportFixture())
    mockedPdf.mockRejectedValueOnce(new Error('500'))
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się pobrać raportu. Spróbuj ponownie.',
    )
    expect(screen.getByRole('heading', { name: 'Raport pacjenta' })).toBeInTheDocument()
  })
})

describe('a week that has no report here', () => {
  it('is worded so it does not imply the report exists', async () => {
    /** A week with no entries, a week that does not exist and a patient who is
     *  not this specialist's all answer 404, and one sentence covers all three
     *  because none is something to act on differently. */
    mockedFetch.mockRejectedValueOnce(new ApiError(404, null))
    render()

    expect(await screen.findByText('Nie znaleziono raportu dla tego tygodnia u tego pacjenta.'))
      .toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wróć do raportów pacjenta/ })).toBeInTheDocument()
  })

  it('is not offered a retry, unlike a failed load', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(404, null))
    render()

    await screen.findByText('Nie znaleziono raportu dla tego tygodnia u tego pacjenta.')

    expect(screen.queryByRole('button', { name: /ponownie/i })).toBeNull()
  })
})

describe('when the report does not load', () => {
  it('says so, offers to ask again, and draws what comes back', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))
    mockedFetch.mockResolvedValueOnce(reportFixture())
    render()

    await userEvent.click(await screen.findByRole('button', { name: /ponownie|Spróbuj/ }))

    expect(await screen.findByRole('heading', { name: 'Raport pacjenta' })).toBeInTheDocument()
  })

  it('never looks like a week with nothing in it', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))
    render()

    expect(await screen.findByText('Nie udało się wczytać raportu. Spróbuj ponownie.'))
      .toBeInTheDocument()
    expect(screen.queryByText(/Nie znaleziono raportu/)).toBeNull()
  })
})
