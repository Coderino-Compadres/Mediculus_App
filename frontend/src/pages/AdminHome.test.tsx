import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import AdminHome from './AdminHome'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import type { Overview, PendingSpecialist } from '../api/admin'

/**
 * "Panel administratora". What is worth pinning:
 *
 *   1. approving is one click and says what it did;
 *   2. rejecting deletes the account, so it asks twice and the second button
 *      says "usuń" — a single click must never reject anybody;
 *   3. a list that failed to load is not drawn as "nobody is waiting".
 */

vi.mock('../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin')>()),
  fetchPendingSpecialists: vi.fn(),
  fetchOverview: vi.fn(),
  approveSpecialist: vi.fn(),
  rejectSpecialist: vi.fn(),
}))
const { fetchPendingSpecialists, fetchOverview, approveSpecialist, rejectSpecialist } =
  await import('../api/admin')
const mockedPending = vi.mocked(fetchPendingSpecialists)
const mockedOverview = vi.mocked(fetchOverview)
const mockedApprove = vi.mocked(approveSpecialist)
const mockedReject = vi.mocked(rejectSpecialist)

const ADMIN = { ...TEST_USER, role: 'admin', isPatient: false, isChild: null, isAdmin: true }

const WAITING: PendingSpecialist = {
  id: 'cccc-3333',
  name: 'Nowa',
  surname: 'Terapeutka',
  email: 'nowa@wp.pl',
  specialization: 'DBT',
  moduleLabel: 'Psychoterapia',
  createdAt: '2026-09-20T10:00:00+02:00',
  createdBy: { id: 'aaaa-1111', name: 'Anna', surname: 'Kowalska', email: 'anna@wp.pl' },
  consentsActive: true,
  passwordSet: true,
}

const OVERVIEW: Overview = {
  accounts: { total: 9, patient: 5, specialist: 2, guardian: 1, admin: 1, other: 0 },
  patients: { adults: 4, minors: 1 },
  specialists: { approved: 1, pending: 1, psychotherapy: 2, diet: 0 },
  care_links: { accepted: 3, pending: 1 },
  guardian_links: { accepted: 1, pending: 0 },
  records: {
    diary_entries: 42, meals: 7, hydration_entries: 3, supplements: 1,
    activities: 2, sleep_nights: 4, health_profiles: 1,
  },
}

beforeEach(() => {
  mockedPending.mockReset()
  mockedOverview.mockReset()
  mockedApprove.mockReset()
  mockedReject.mockReset()
  mockedPending.mockResolvedValue([WAITING])
  mockedOverview.mockResolvedValue(OVERVIEW)
})

function renderScreen() {
  return renderWithProviders(<AdminHome />, { user: ADMIN, route: ROUTES.adminHome })
}

describe('AdminHome — the accounts waiting for a decision', () => {
  it('names the person, who vouched for them, and whether they have logged in', async () => {
    renderScreen()

    const card = await screen.findByRole('article', { name: 'Nowa Terapeutka' })
    expect(within(card).getByText('nowa@wp.pl')).toBeInTheDocument()
    expect(within(card).getByText(/Konto założył\(a\): Anna Kowalska/)).toBeInTheDocument()
    expect(within(card).getByText(/udzielił zgód i ustawił własne hasło/)).toBeInTheDocument()
  })

  it('approves with one click and says so', async () => {
    mockedApprove.mockResolvedValue([])
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Zatwierdź' }))

    expect(mockedApprove).toHaveBeenCalledWith('cccc-3333')
    expect(await screen.findByText('Zatwierdzono konto: Nowa Terapeutka.')).toBeInTheDocument()
    expect(screen.getByText('Żadne konto nie czeka na weryfikację.')).toBeInTheDocument()
  })

  it('never rejects on the first click', async () => {
    mockedReject.mockResolvedValue([])
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Odrzuć' }))

    expect(mockedReject).not.toHaveBeenCalled()
    expect(screen.getByText(/usuwa konto na stałe/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tak, odrzuć i usuń konto' }))

    expect(mockedReject).toHaveBeenCalledWith('cccc-3333')
    expect(
      await screen.findByText('Odrzucono i usunięto konto: Nowa Terapeutka.'),
    ).toBeInTheDocument()
  })

  it('can take the rejection back before it is sent', async () => {
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Odrzuć' }))
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    expect(mockedReject).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Zatwierdź' })).toBeInTheDocument()
  })

  it('says when nobody is waiting', async () => {
    mockedPending.mockResolvedValue([])
    renderScreen()

    expect(await screen.findByText('Żadne konto nie czeka na weryfikację.')).toBeInTheDocument()
  })

  it('does not draw a failed load as an empty list', async () => {
    mockedPending.mockRejectedValue(new ApiError(0, null))
    renderScreen()

    expect(
      await screen.findByText('Nie udało się wczytać kont do weryfikacji. Spróbuj ponownie.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Żadne konto nie czeka na weryfikację.')).toBeNull()
  })

  it('shows the server’s refusal when a decision is refused', async () => {
    mockedApprove.mockRejectedValue(
      new ApiError(404, 'Nie znaleziono konta specjalisty oczekującego na weryfikację.'),
    )
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Zatwierdź' }))

    expect(
      await screen.findByText('Nie znaleziono konta specjalisty oczekującego na weryfikację.'),
    ).toBeInTheDocument()
  })
})

describe('AdminHome — the overview', () => {
  it('shows counts and says there is no content behind them', async () => {
    renderScreen()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.getByText('wpisy w dzienniczku')).toBeInTheDocument()
    expect(screen.getByText(/treść wpisów nie jest dostępna/i)).toBeInTheDocument()
  })

  it('leads to the account list and the audit log', async () => {
    renderScreen()

    expect(await screen.findByRole('link', { name: /Konta w bazie/ })).toHaveAttribute(
      'href', ROUTES.adminAccounts,
    )
    expect(screen.getByRole('link', { name: /Dziennik działań/ })).toHaveAttribute(
      'href', ROUTES.adminAuditLog,
    )
  })
})
