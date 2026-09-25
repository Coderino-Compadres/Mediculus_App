import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import SpecialistPending from './SpecialistPending'
import { ROUTES } from '../routes'
import type { AuthUser } from '../api/auth'

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  fetchCurrentUser: vi.fn(),
}))
const { fetchCurrentUser } = await import('../api/auth')
const mockedFetchUser = vi.mocked(fetchCurrentUser)

const PENDING: AuthUser = {
  ...TEST_USER,
  role: 'specjalista',
  isPatient: false,
  isSpecialist: true,
  isChild: null,
  specialistApproved: false,
}

beforeEach(() => {
  mockedFetchUser.mockReset()
})

describe('SpecialistPending', () => {
  it('says what the account cannot do yet, and that nothing is asked of it', () => {
    renderWithProviders(<SpecialistPending />, { user: PENDING, route: ROUTES.specialistPending })

    expect(
      screen.getByRole('heading', { level: 1, name: 'Konto czeka na weryfikację' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/nie możesz zapraszać pacjentów/)).toBeInTheDocument()
    expect(screen.getByText(/Nie musisz nic robić/)).toBeInTheDocument()
  })

  it('re-reads the session, so an approval shows without signing out', async () => {
    const setUser = vi.fn()
    const approved = { ...PENDING, specialistApproved: true }
    mockedFetchUser.mockResolvedValue(approved)
    renderWithProviders(<SpecialistPending />, {
      user: PENDING, route: ROUTES.specialistPending, setUser,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Sprawdź ponownie' }))

    expect(setUser).toHaveBeenCalledWith(approved)
  })

  it('says so when the account is still waiting', async () => {
    mockedFetchUser.mockResolvedValue(PENDING)
    renderWithProviders(<SpecialistPending />, { user: PENDING, route: ROUTES.specialistPending })

    await userEvent.click(screen.getByRole('button', { name: 'Sprawdź ponownie' }))

    expect(await screen.findByText('Konto nadal czeka na weryfikację.')).toBeInTheDocument()
  })
})
