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

describe('the guardian invitation card is no longer on this screen', () => {
  /**
   * It moved to pages/ParentHome.tsx with the guardians themselves — both tiles
   * here lead into the patient app, which answers a guardian 403, so App.tsx
   * redirects them to their own screen. Covered in full there; what matters here
   * is that this screen does not ask for invitations any more, whoever is on it.
   */
  it('is not fetched for a patient account', async () => {
    renderWithProviders(<ModuleSelect />, { user: TEST_USER })

    await waitFor(() => expect(screen.getByText(/Psychoterapia/)).toBeInTheDocument())
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('is not fetched even if a guardian somehow renders this screen', async () => {
    renderWithProviders(<ModuleSelect />, {
      user: { ...TEST_USER, role: 'rodzic', isPatient: false, isChild: null },
    })

    await waitFor(() => expect(screen.getByText(/Psychoterapia/)).toBeInTheDocument())
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /zaakceptuj/i })).toBeNull()
  })
})
