import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import { WEEK_A, WEEK_B, reportFixture } from '../test/reportFixture'
import SpecialistPatientReports from './SpecialistPatientReports'
import { ApiError } from '../api/client'
import type { SpecialistPatient } from '../api/specialist'

const PATIENT_ID = 'p0000000-0000-0000-0000-000000000001'
const navigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ patientId: PATIENT_ID }),
  }
})

vi.mock('../api/specialist', () => ({
  fetchPatientReports: vi.fn(),
  fetchCaseload: vi.fn(),
}))
const { fetchCaseload, fetchPatientReports } = await import('../api/specialist')
const mockedReports = vi.mocked(fetchPatientReports)
const mockedCaseload = vi.mocked(fetchCaseload)

/**
 * One patient's weekly reports, as their specialist reads them.
 *
 * The list itself is the patient's own list with a different frame, so what is
 * pinned here is the frame and the two answers that are not "it failed":
 *
 * - a patient who is not this specialist's answers **404**, which is not a
 *   failed load and must not be offered a retry — the way out is the caseload;
 * - a patient with no reports yet is said to have none, and that must never be
 *   what a failed request looks like;
 * - the heading's name is fetched from the caseload rather than passed in
 *   navigation state, so a reloaded page and a pasted link still name whose
 *   week this is — and a failure to get it withholds no reports.
 */

const SPECIALIST = { ...TEST_USER, isPatient: false, isSpecialist: true, role: 'specjalista' }

function patient(overrides: Partial<SpecialistPatient> = {}): SpecialistPatient {
  return {
    id: PATIENT_ID,
    name: 'Ola',
    surname: 'Testowa',
    email: 'ola@wp.pl',
    isChild: false,
    acceptedAt: '2026-08-12T09:31:02Z',
    consentsActive: true,
    activity: { entryCount: 12, streakDays: 4, lastEntryDate: '2026-09-07' },
    ...overrides,
  }
}

function render() {
  return renderWithProviders(<SpecialistPatientReports />, { user: SPECIALIST })
}

beforeEach(() => {
  navigate.mockReset()
  mockedReports.mockReset()
  mockedCaseload.mockReset()
  mockedCaseload.mockResolvedValue({ patients: [patient()], pending: [] })
})

describe('the list', () => {
  it('names the patient it belongs to', async () => {
    /** From the caseload, not from navigation state — `state` is gone on a
     *  reload and on a pasted link, where only the id survives. */
    mockedReports.mockResolvedValueOnce([reportFixture()])
    render()

    expect(await screen.findByText('Ola Testowa')).toBeInTheDocument()
  })

  it('shows the reports even when the name cannot be fetched', async () => {
    /** Not knowing the name is no reason to withhold the reports. */
    mockedReports.mockResolvedValueOnce([reportFixture()])
    mockedCaseload.mockRejectedValueOnce(new Error('503'))
    render()

    expect(await screen.findByText('10 – 16 sierpnia 2026')).toBeInTheDocument()
  })

  it('says the reports are generated weekly and cannot be made to order', async () => {
    mockedReports.mockResolvedValueOnce([])
    render()

    expect(await screen.findByText(/powstają automatycznie co tydzień/)).toBeInTheDocument()
  })

  it('offers nothing that generates, edits or shares a report', async () => {
    mockedReports.mockResolvedValueOnce([reportFixture()])
    render()

    await screen.findByText('10 – 16 sierpnia 2026')

    expect(screen.queryByRole('button', { name: /wygeneruj|utwórz|edytuj|wyślij/i })).toBeNull()
  })

  it('is one row per week, and opens that week on a tap', async () => {
    mockedReports.mockResolvedValueOnce([
      reportFixture(),
      reportFixture({ weekStart: WEEK_A, id: `week-${WEEK_A}`, rangeLabel: '3 – 9 sierpnia 2026' }),
    ])
    render()

    await userEvent.click(await screen.findByText('10 – 16 sierpnia 2026'))

    expect(navigate).toHaveBeenCalledWith(
      `/specialist/patients/${PATIENT_ID}/reports/week-${WEEK_B}`,
    )
  })

  it('marks a week that held flagged days, without shouting about it', async () => {
    mockedReports.mockResolvedValueOnce([
      reportFixture({ riskyDays: [{ date: '2026-08-11', notePreview: 'Alkohol.', entryId: 'e1' }] }),
    ])
    render()

    expect(await screen.findByText(/1 dzień z oznaczeniem/)).toBeInTheDocument()
  })

  it('previews the mood and the harder days, not the diary', async () => {
    mockedReports.mockResolvedValueOnce([reportFixture()])
    render()

    const preview = await screen.findByText(/Średni nastrój 3,0 \/ 5/)

    expect(preview).toHaveTextContent('trudniejsze dni 1 z 7')
    expect(preview).not.toHaveTextContent(/notatka|wpis:/i)
  })

  it('says a patient has no reports yet, and why the first one is not there', async () => {
    mockedReports.mockResolvedValueOnce([])
    render()

    expect(await screen.findByText(/nie ma jeszcze żadnego raportu/)).toBeInTheDocument()
    expect(screen.getByText(/Pierwszy powstanie po/)).toBeInTheDocument()
  })
})

describe('a patient who is not this specialist\'s', () => {
  it('is answered with "not your patient", not with a failed load', async () => {
    /** The API answers 404 for somebody else's patient exactly as it does for
     *  an id that is not a patient at all — a 403 would confirm the account is
     *  real, which the invitation form takes care not to answer. */
    mockedReports.mockRejectedValueOnce(new ApiError(404, null))
    render()

    expect(await screen.findByText(/nie jest przypisany do Twojego konta/)).toBeInTheDocument()
  })

  it('is not offered a retry, because retrying cannot change it', async () => {
    mockedReports.mockRejectedValueOnce(new ApiError(404, null))
    render()

    await screen.findByText(/nie jest przypisany do Twojego konta/)

    expect(screen.queryByRole('button', { name: /ponownie/i })).toBeNull()
    expect(screen.getByRole('link', { name: /Wróć do panelu/ })).toBeInTheDocument()
  })

  it('is not told the patient has no reports', async () => {
    mockedReports.mockRejectedValueOnce(new ApiError(404, null))
    render()

    await screen.findByText(/nie jest przypisany do Twojego konta/)

    expect(screen.queryByText(/nie ma jeszcze żadnego raportu/)).toBeNull()
  })
})

describe('when the reports do not load', () => {
  it('says so and offers to ask again', async () => {
    mockedReports.mockRejectedValueOnce(new Error('503'))
    render()

    expect(await screen.findByText('Nie udało się wczytać raportów pacjenta. Spróbuj ponownie.'))
      .toBeInTheDocument()
    expect(screen.queryByText(/nie ma jeszcze żadnego raportu/)).toBeNull()
  })

  it('draws what comes back on the retry', async () => {
    mockedReports.mockRejectedValueOnce(new Error('503'))
    mockedReports.mockResolvedValueOnce([reportFixture()])
    render()

    await userEvent.click(await screen.findByRole('button', { name: /ponownie|Spróbuj/ }))

    expect(await screen.findByText('10 – 16 sierpnia 2026')).toBeInTheDocument()
  })
})

describe('paging', () => {
  it('is not drawn for a handful of reports', async () => {
    mockedReports.mockResolvedValueOnce([reportFixture()])
    render()

    await screen.findByText('10 – 16 sierpnia 2026')

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('counts reports rather than entries once there are enough of them', async () => {
    mockedReports.mockResolvedValueOnce(
      Array.from({ length: 9 }, (_, index) =>
        reportFixture({
          weekStart: `2026-0${index < 4 ? 7 : 8}-0${(index % 4) + 1}`,
          id: `week-${index}`,
          rangeLabel: `tydzień ${index}`,
        }),
      ),
    )
    render()

    expect(await screen.findByRole('status')).toHaveTextContent('raportów')
  })
})
