import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import AdminAccounts from './AdminAccounts'
import { ApiError } from '../api/client'
import { adminAccountPath, ROUTES } from '../routes'
import type { AccountRow } from '../api/admin'

vi.mock('../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin')>()),
  fetchAccounts: vi.fn(),
}))
const { fetchAccounts } = await import('../api/admin')
const mockedAccounts = vi.mocked(fetchAccounts)

const ADMIN = { ...TEST_USER, role: 'admin', isPatient: false, isChild: null, isAdmin: true }

function row(fields: Partial<AccountRow> & Pick<AccountRow, 'id' | 'kind'>): AccountRow {
  return {
    name: null,
    surname: null,
    email: null,
    role: null,
    createdAt: '2026-09-01T10:00:00+02:00',
    consentsActive: true,
    mustChangePassword: false,
    specialistApproved: null,
    isChild: null,
    ...fields,
  }
}

const ROWS: AccountRow[] = [
  row({ id: 'p1', kind: 'patient', name: 'Zuzia', surname: 'Dieta', email: 'zuzia@wp.pl', isChild: true }),
  row({ id: 'p2', kind: 'patient', name: 'Jan', surname: 'Kowal', email: 'jan@wp.pl' }),
  row({
    id: 's1', kind: 'specialist', name: 'Nowa', surname: 'Terapeutka', email: 'nowa@wp.pl',
    specialistApproved: false,
  }),
  row({ id: 'g1', kind: 'guardian', name: 'Mama', surname: 'Zuzi', email: 'mama@wp.pl' }),
]

beforeEach(() => {
  mockedAccounts.mockReset()
  mockedAccounts.mockResolvedValue(ROWS)
})

function renderScreen() {
  return renderWithProviders(<AdminAccounts />, { user: ADMIN, route: ROUTES.adminAccounts })
}

describe('AdminAccounts', () => {
  it('lists every account, each leading to its detail', async () => {
    renderScreen()

    expect(await screen.findByRole('link', { name: 'Zuzia Dieta' })).toHaveAttribute(
      'href', adminAccountPath('p1'),
    )
    expect(screen.getByRole('link', { name: 'Mama Zuzi' })).toBeInTheDocument()
  })

  it('says what state an account is in', async () => {
    renderScreen()

    expect(await screen.findByText('czeka na weryfikację')).toBeInTheDocument()
    expect(screen.getByText('małoletni')).toBeInTheDocument()
  })

  it('filters by kind, with a chip only for kinds that exist', async () => {
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Pacjenci (2)' }))

    expect(screen.getByRole('link', { name: 'Jan Kowal' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mama Zuzi' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Administratorzy/ })).toBeNull()
  })

  it('searches by name and by address', async () => {
    renderScreen()

    await userEvent.type(await screen.findByLabelText(/Szukaj/), 'mama@')

    expect(screen.getByRole('link', { name: 'Mama Zuzi' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Jan Kowal' })).toBeNull()
  })

  it('says when nothing matches, rather than drawing nothing', async () => {
    renderScreen()

    await userEvent.type(await screen.findByLabelText(/Szukaj/), 'nikogo-takiego')

    expect(screen.getByText('Żadne konto nie pasuje do wybranych filtrów.')).toBeInTheDocument()
  })

  it('does not draw a failed load as an empty database', async () => {
    mockedAccounts.mockRejectedValue(new ApiError(0, null))
    renderScreen()

    expect(
      await screen.findByText('Nie udało się wczytać listy kont. Spróbuj ponownie.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('W bazie nie ma jeszcze żadnych kont.')).toBeNull()
  })
})
