import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { ApiError } from '../api/client'
import GuardianInvitations from './GuardianInvitations'
import type { GuardianInvitation } from '../api/guardian'

vi.mock('../api/guardian', () => ({
  fetchGuardianInvitations: vi.fn(),
  acceptGuardianInvitation: vi.fn(),
  rejectGuardianInvitation: vi.fn(),
}))
const { fetchGuardianInvitations, acceptGuardianInvitation, rejectGuardianInvitation } =
  await import('../api/guardian')
const mockedFetch = vi.mocked(fetchGuardianInvitations)
const mockedAccept = vi.mocked(acceptGuardianInvitation)
const mockedReject = vi.mocked(rejectGuardianInvitation)

const INVITATION: GuardianInvitation = {
  id: 'd0000000-0000-0000-0000-000000000001',
  childName: 'Ola',
  childSurname: 'Testowa',
  childEmail: 'dziecko@wp.pl',
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedAccept.mockReset()
  mockedReject.mockReset()
})

describe('what the guardian sees', () => {
  it('names who is asking, so the decision is about a person and not an id', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])

    renderWithProviders(<GuardianInvitations />)

    expect(await screen.findByText(/Ola Testowa/)).toBeInTheDocument()
    expect(screen.getByText('dziecko@wp.pl')).toBeInTheDocument()
  })

  it('says what accepting means, because it is the consent the child cannot give', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])

    renderWithProviders(<GuardianInvitations />)

    expect(await screen.findByText(/zgodą na przetwarzanie jego danych/i)).toBeInTheDocument()
  })

  it('falls back to the address when the account has no name', async () => {
    mockedFetch.mockResolvedValueOnce([
      { ...INVITATION, childName: null, childSurname: null },
    ])

    renderWithProviders(<GuardianInvitations />)

    // The address then appears twice — as the label and on its own line — so
    // this asserts on the sentence rather than on the string.
    expect(await screen.findByText(/prosi o powiązanie/i)).toHaveTextContent('dziecko@wp.pl')
  })

  it('draws nothing at all when nobody has asked', async () => {
    mockedFetch.mockResolvedValueOnce([])

    const { container } = renderWithProviders(<GuardianInvitations />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.textContent).toBe('')
  })

  it('never lets a failed load look like nobody asked', async () => {
    // A child is blocked on the other side of this list, so silence is the one
    // answer this card must not give when it does not know.
    mockedFetch.mockRejectedValueOnce(new Error('network down'))

    renderWithProviders(<GuardianInvitations />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('answering', () => {
  it('accepts the invitation and takes the card away', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])
    mockedAccept.mockResolvedValueOnce(undefined)

    renderWithProviders(<GuardianInvitations />)
    await userEvent.click(await screen.findByRole('button', { name: /zaakceptuj/i }))

    expect(mockedAccept).toHaveBeenCalledWith(INVITATION.id)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /zaakceptuj/i })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/powiązane/i)
  })

  it('refuses the invitation and says so', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])
    mockedReject.mockResolvedValueOnce(undefined)

    renderWithProviders(<GuardianInvitations />)
    await userEvent.click(await screen.findByRole('button', { name: /odrzuć/i }))

    expect(mockedReject).toHaveBeenCalledWith(INVITATION.id)
    expect(await screen.findByRole('status')).toHaveTextContent(/odrzucona/i)
  })

  it('keeps the card when the decision did not reach the server', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])
    mockedAccept.mockRejectedValueOnce(new Error('network down'))

    renderWithProviders(<GuardianInvitations />)
    await userEvent.click(await screen.findByRole('button', { name: /zaakceptuj/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /zaakceptuj/i })).toBeInTheDocument()
  })

  /**
   * The list loaded fine; it was the decision that failed. Blaming the load
   * sends the guardian to refresh a page whose content is already correct, and
   * says nothing about whether the child is now linked.
   */
  it('blames the decision rather than the list', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])
    mockedAccept.mockRejectedValueOnce(new Error('network down'))

    renderWithProviders(<GuardianInvitations />)
    await userEvent.click(await screen.findByRole('button', { name: /zaakceptuj/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nie udało się zapisać odpowiedzi/i)
    expect(screen.queryByText(/wczytać/i)).not.toBeInTheDocument()
  })

  /**
   * The child withdrew it while the guardian was looking at the card, or it was
   * answered in another tab. Leaving an answerable card on screen invites a
   * second click that fails the same way.
   */
  it('takes away a card the server no longer has', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])
    mockedAccept.mockRejectedValueOnce(new ApiError(404, 'Nie znaleziono.'))

    renderWithProviders(<GuardianInvitations />)
    await userEvent.click(await screen.findByRole('button', { name: /zaakceptuj/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nie czeka już na odpowiedź/i)
    expect(screen.queryByRole('button', { name: /zaakceptuj/i })).not.toBeInTheDocument()
  })

  it('does not claim the link was made when the server said no', async () => {
    mockedFetch.mockResolvedValueOnce([INVITATION])
    mockedAccept.mockRejectedValueOnce(new ApiError(404, 'Nie znaleziono.'))

    renderWithProviders(<GuardianInvitations />)
    await userEvent.click(await screen.findByRole('button', { name: /zaakceptuj/i }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('answers one invitation at a time', async () => {
    const second = { ...INVITATION, id: 'd0000000-0000-0000-0000-000000000002' }
    mockedFetch.mockResolvedValueOnce([INVITATION, second])
    mockedAccept.mockReturnValueOnce(new Promise(() => {}))

    renderWithProviders(<GuardianInvitations />)
    const [firstAccept] = await screen.findAllByRole('button', { name: /zaakceptuj/i })
    await userEvent.click(firstAccept)

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
  })
})
