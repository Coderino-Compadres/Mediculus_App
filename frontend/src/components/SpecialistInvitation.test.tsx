import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { ApiError } from '../api/client'
import SpecialistInvitationCard from './SpecialistInvitation'
import type { SpecialistInvitation } from '../api/specialist'

vi.mock('../api/specialist', () => ({
  fetchSpecialistInvitation: vi.fn(),
  acceptSpecialistInvitation: vi.fn(),
  rejectSpecialistInvitation: vi.fn(),
}))
const { fetchSpecialistInvitation, acceptSpecialistInvitation, rejectSpecialistInvitation } =
  await import('../api/specialist')
const mockedFetch = vi.mocked(fetchSpecialistInvitation)
const mockedAccept = vi.mocked(acceptSpecialistInvitation)
const mockedReject = vi.mocked(rejectSpecialistInvitation)

const INVITATION: SpecialistInvitation = {
  specialist: 'Anna Terapeutka',
  email: 'anna@wp.pl',
  approach: 'psychoterapia poznawczo-behawioralna',
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedAccept.mockReset()
  mockedReject.mockReset()
})

describe('what the patient is asked', () => {
  it('names the person asking, so the decision is about somebody and not an id', async () => {
    mockedFetch.mockResolvedValueOnce(INVITATION)

    renderWithProviders(<SpecialistInvitationCard />)

    expect(await screen.findByText('Anna Terapeutka')).toBeInTheDocument()
    expect(screen.getByText('psychoterapia poznawczo-behawioralna')).toBeInTheDocument()
    expect(screen.getByText('anna@wp.pl')).toBeInTheDocument()
  })

  it('says what the specialist will and will not see', async () => {
    mockedFetch.mockResolvedValueOnce(INVITATION)

    renderWithProviders(<SpecialistInvitationCard />)

    expect(await screen.findByText(/raporty tygodniowe/i)).toBeInTheDocument()
    expect(screen.getByText(/nie zobaczy treści/i)).toBeInTheDocument()
  })

  it('says before the tap that accepting cannot be taken back', async () => {
    // The client's rule: ending the link is the specialist's action. A screen
    // that collected this agreement without saying so would be collecting a
    // consent that is not informed.
    mockedFetch.mockResolvedValueOnce(INVITATION)

    renderWithProviders(<SpecialistInvitationCard />)

    expect(await screen.findByText(/nie można później samemu wycofać/i)).toBeInTheDocument()
  })

  it('offers refusing at the same weight as accepting', async () => {
    mockedFetch.mockResolvedValueOnce(INVITATION)

    renderWithProviders(<SpecialistInvitationCard />)

    expect(await screen.findByRole('button', { name: 'Potwierdzam' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Odrzuć' })).toBeInTheDocument()
  })

  it('draws nothing at all when nobody has asked', async () => {
    // Almost every patient, almost always. An empty card would be a permanent
    // reminder of a thing that has not happened.
    mockedFetch.mockResolvedValueOnce(null)

    const { container } = renderWithProviders(<SpecialistInvitationCard />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(container.querySelector('.specialist-invitation')).toBeNull()
  })

  it('says so when the check itself failed, rather than looking like "nobody asked"', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))

    renderWithProviders(<SpecialistInvitationCard />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Nie udało się sprawdzić zaproszeń/i,
    )
  })
})

describe('answering', () => {
  it('accepts and confirms who can now read the reports', async () => {
    mockedFetch.mockResolvedValueOnce(INVITATION)
    mockedAccept.mockResolvedValueOnce(null)

    renderWithProviders(<SpecialistInvitationCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Potwierdzam' }))

    expect(mockedAccept).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent(/Anna Terapeutka/)
  })

  it('refuses without recording anything, and says nobody saw the data', async () => {
    mockedFetch.mockResolvedValueOnce(INVITATION)
    mockedReject.mockResolvedValueOnce(null)

    renderWithProviders(<SpecialistInvitationCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Odrzuć' }))

    expect(mockedReject).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent(/odrzucone/i)
  })

  it('explains a 404 as an invitation that is no longer waiting', async () => {
    // Withdrawn by the specialist, or answered in another tab: there is no
    // decision left, so the card goes away with the explanation.
    mockedFetch.mockResolvedValueOnce(INVITATION)
    mockedAccept.mockRejectedValueOnce(new ApiError(404, null))

    renderWithProviders(<SpecialistInvitationCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Potwierdzam' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nie czeka już na odpowiedź/i)
    expect(screen.queryByRole('button', { name: 'Potwierdzam' })).toBeNull()
  })

  it('keeps the card when saving the answer failed, so it can be tried again', async () => {
    mockedFetch.mockResolvedValueOnce(INVITATION)
    mockedAccept.mockRejectedValueOnce(new ApiError(500, null))

    renderWithProviders(<SpecialistInvitationCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Potwierdzam' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się zapisać/i)
    expect(screen.getByRole('button', { name: 'Potwierdzam' })).toBeInTheDocument()
  })
})
