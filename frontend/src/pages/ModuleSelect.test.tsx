import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, TEST_USER } from '../test/render'
import ModuleSelect from './ModuleSelect'

vi.mock('../api/guardian', () => ({
  fetchGuardianInvitations: vi.fn(),
  acceptGuardianInvitation: vi.fn(),
  rejectGuardianInvitation: vi.fn(),
}))
const { fetchGuardianInvitations } = await import('../api/guardian')
const mockedFetch = vi.mocked(fetchGuardianInvitations)

beforeEach(() => mockedFetch.mockReset())

describe('the guardian invitation card', () => {
  it('is asked for on a guardian account', async () => {
    // This is the first screen after logging in, and a child's account stays
    // blocked until the invitation on it is answered.
    mockedFetch.mockResolvedValueOnce([
      {
        id: 'd0000000-0000-0000-0000-000000000001',
        childName: 'Ola',
        childSurname: 'Testowa',
        childEmail: 'dziecko@wp.pl',
      },
    ])

    renderWithProviders(<ModuleSelect />, {
      user: { ...TEST_USER, role: 'rodzic', isChild: null },
    })

    expect(await screen.findByRole('button', { name: /zaakceptuj/i })).toBeInTheDocument()
  })

  it('is not even fetched for a patient account', async () => {
    renderWithProviders(<ModuleSelect />, { user: TEST_USER })

    await waitFor(() => expect(screen.getByText(/Psychoterapia/)).toBeInTheDocument())
    expect(mockedFetch).not.toHaveBeenCalled()
  })
})
