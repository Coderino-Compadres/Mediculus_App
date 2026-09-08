import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import SpecialistParentAccounts from './SpecialistParentAccounts'
import { ApiError } from '../api/client'
import type {
  ParentInvitation,
  SpecialistCaseload,
  SpecialistPatient,
} from '../api/specialist'

vi.mock('../api/specialist', () => ({
  fetchCaseload: vi.fn(),
  fetchParentInvitations: vi.fn(),
  createParentInvitation: vi.fn(),
  revokeParentInvitation: vi.fn(),
}))
const {
  createParentInvitation,
  fetchCaseload,
  fetchParentInvitations,
  revokeParentInvitation,
} = await import('../api/specialist')
const mockedCaseload = vi.mocked(fetchCaseload)
const mockedInvitations = vi.mocked(fetchParentInvitations)
const mockedCreate = vi.mocked(createParentInvitation)
const mockedRevoke = vi.mocked(revokeParentInvitation)

/**
 * "Konta opiekunów". The guardian link is normally started by the child; this is
 * the other direction, for a specialist sitting with a family — and because this
 * deployment sends no mail at all, the invitation travels as a code handed over
 * in the room.
 *
 * Three properties are worth a test each, and all three are about the code:
 * it is shown **once** and the screen says so (it is stored hashed, so nothing
 * can read it back); it is issued for a **minor patient of this specialist**,
 * picked from a list rather than typed as an id; and a **used** invitation is a
 * record of an account that exists, so it cannot be withdrawn.
 */

const SPECIALIST = { ...TEST_USER, isPatient: false, isSpecialist: true, role: 'specjalista' }

function patient(overrides: Partial<SpecialistPatient> = {}): SpecialistPatient {
  return {
    id: 'p0000000-0000-0000-0000-000000000001',
    name: 'Ola',
    surname: 'Testowa',
    email: 'ola@wp.pl',
    isChild: true,
    acceptedAt: '2026-08-12T09:31:02Z',
    consentsActive: true,
    activity: { entryCount: 4, streakDays: 1, lastEntryDate: '2026-09-07' },
    ...overrides,
  }
}

function invitation(overrides: Partial<ParentInvitation> = {}): ParentInvitation {
  return {
    id: 'i0000000-0000-0000-0000-000000000001',
    email: 'rodzic@wp.pl',
    childId: patient().id,
    childName: 'Ola',
    childSurname: 'Testowa',
    childEmail: 'ola@wp.pl',
    createdAt: '2026-09-01T10:00:00Z',
    expiresAt: '2026-09-15T10:00:00Z',
    usedAt: null,
    status: 'pending',
    ...overrides,
  }
}

async function render({
  caseload = { patients: [patient()], pending: [] } as SpecialistCaseload,
  invitations = [] as ParentInvitation[],
} = {}) {
  mockedCaseload.mockResolvedValue(caseload)
  mockedInvitations.mockResolvedValue(invitations)
  const result = renderWithProviders(<SpecialistParentAccounts />, { user: SPECIALIST })
  await waitFor(() => expect(screen.queryByText('Wczytywanie…')).toBeNull())
  return result
}

async function issue(code = 'ABCD-EFGH-JKMN-PQRT') {
  mockedCreate.mockResolvedValueOnce({ code, invitation: invitation() })
  await userEvent.selectOptions(screen.getByLabelText('Pacjent'), patient().id)
  await userEvent.type(screen.getByLabelText('Adres e-mail opiekuna'), 'rodzic@wp.pl')
  await userEvent.click(screen.getByRole('button', { name: 'Wystaw kod' }))
}

beforeEach(() => {
  mockedCaseload.mockReset()
  mockedInvitations.mockReset()
  mockedCreate.mockReset()
  mockedRevoke.mockReset()
})

describe('the screen', () => {
  it('says the code is handed over in person, because nothing is sent', async () => {
    await render()

    expect(screen.getByText(/aplikacja nie\s+wysyła wiadomości/)).toBeInTheDocument()
  })

  it('offers only this specialist\'s minor patients, and never a typed id', async () => {
    /** The backend refuses anybody else's patient; an id field would be a way
     *  to ask whether an account exists. */
    await render({
      caseload: {
        patients: [patient(), patient({ id: 'p-adult', name: 'Jan', isChild: false })],
        pending: [patient({ id: 'p-pending', name: 'Zofia', acceptedAt: null, activity: null })],
      },
      invitations: [],
    })

    const options = within(screen.getByLabelText('Pacjent')).getAllByRole('option')

    expect(options.map((option) => option.textContent)).toEqual(['Wybierz pacjenta', 'Ola Testowa'])
    expect(screen.queryByLabelText(/id pacjenta/i)).toBeNull()
  })

  it('explains why there is no form when no minor has accepted', async () => {
    /** Not an error and not an empty form: without a minor patient there is
     *  nothing to issue an invitation *for*. */
    await render({ caseload: { patients: [patient({ isChild: false })], pending: [] } })

    expect(screen.getByText(/Nie masz małoletnich pacjentów/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Wystaw kod' })).toBeNull()
  })

  it('cannot issue without both answers', async () => {
    await render()

    expect(screen.getByRole('button', { name: 'Wystaw kod' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Pacjent'), patient().id)
    expect(screen.getByRole('button', { name: 'Wystaw kod' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Adres e-mail opiekuna'), 'rodzic@wp.pl')
    expect(screen.getByRole('button', { name: 'Wystaw kod' })).toBeEnabled()
  })

  it('never lets a failed load look like "no invitations yet"', async () => {
    mockedCaseload.mockRejectedValueOnce(new Error('503'))
    mockedInvitations.mockResolvedValue([])

    renderWithProviders(<SpecialistParentAccounts />, { user: SPECIALIST })

    expect(await screen.findByText(/Nie udało się wczytać wystawionych zaproszeń/))
      .toBeInTheDocument()
    expect(screen.queryByText(/Nie wystawiłeś jeszcze żadnego zaproszenia/)).toBeNull()
  })
})

describe('the code that was just issued', () => {
  it('is shown, once, with the sentence saying it will not be shown again', async () => {
    await render()

    await issue('ABCD-EFGH-JKMN-PQRT')

    expect(await screen.findByText('ABCD-EFGH-JKMN-PQRT')).toBeInTheDocument()
    expect(screen.getByText(/Nie zobaczysz go ponownie/)).toBeInTheDocument()
  })

  it('says what to do if it is lost, instead of implying it can be looked up', async () => {
    /** It is stored hashed like a password: no endpoint can read it back, so
     *  the only way out is revoke and issue a new one. */
    await render()

    await issue()

    expect(await screen.findByText(/anuluj\s+zaproszenie i wystaw nowe/)).toBeInTheDocument()
  })

  it('names the address the guardian has to register with', async () => {
    /** The code is bound to one address, so registering with another fails —
     *  and the specialist is the one who has to say which. */
    await render()

    await issue()

    const card = await screen.findByRole('region', { name: 'Kod zaproszenia' })

    expect(within(card).getByText('rodzic@wp.pl')).toBeInTheDocument()
    expect(within(card).getByText(/konto rodzica lub opiekuna/)).toBeInTheDocument()
  })

  it('names the child the guardian account will be linked to', async () => {
    await render()

    await issue()

    const card = await screen.findByRole('region', { name: 'Kod zaproszenia' })

    expect(card).toHaveTextContent('Ola Testowa')
  })

  it('appears in the list of issued invitations straight away', async () => {
    await render()

    await issue()

    await waitFor(() =>
      expect(screen.getByText(/Oczekuje na wykorzystanie/)).toBeInTheDocument(),
    )
  })

  it('clears the form, so the next code is not issued to the same address by habit', async () => {
    await render()

    await issue()

    await waitFor(() =>
      expect(screen.getByLabelText('Adres e-mail opiekuna')).toHaveValue(''),
    )
  })

  it('disappears when that invitation is withdrawn', async () => {
    /** The code on screen belonged to the invitation just withdrawn, so it must
     *  not stay readable next to a list that no longer holds it. */
    await render()

    await issue('ABCD-EFGH-JKMN-PQRT')
    await screen.findByText('ABCD-EFGH-JKMN-PQRT')

    mockedRevoke.mockResolvedValueOnce([])
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    await waitFor(() => expect(screen.queryByText('ABCD-EFGH-JKMN-PQRT')).toBeNull())
  })
})

describe('when the invitation is refused', () => {
  it('shows the refusal on the input that produced it', async () => {
    mockedCreate.mockRejectedValueOnce(
      new ApiError(400, null, { parent_email: 'Ten adres ma już konto.' }),
    )
    await render()

    await userEvent.selectOptions(screen.getByLabelText('Pacjent'), patient().id)
    await userEvent.type(screen.getByLabelText('Adres e-mail opiekuna'), 'rodzic@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Wystaw kod' }))

    expect(await screen.findByText('Ten adres ma już konto.')).toBeInTheDocument()
    expect(screen.getByLabelText('Adres e-mail opiekuna')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows no code at all', async () => {
    /** A code on screen next to a refusal would be a credential for an
     *  invitation that does not exist. */
    mockedCreate.mockRejectedValueOnce(new ApiError(400, 'Nie wystawiono.'))
    await render()

    await userEvent.selectOptions(screen.getByLabelText('Pacjent'), patient().id)
    await userEvent.type(screen.getByLabelText('Adres e-mail opiekuna'), 'rodzic@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Wystaw kod' }))

    expect(await screen.findByText('Nie wystawiono.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Kod zaproszenia' })).toBeNull()
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('network'))
    await render()

    await userEvent.selectOptions(screen.getByLabelText('Pacjent'), patient().id)
    await userEvent.type(screen.getByLabelText('Adres e-mail opiekuna'), 'rodzic@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Wystaw kod' }))

    expect(await screen.findByText(/Nie udało się wystawić zaproszenia/)).toBeInTheDocument()
  })
})

describe('the invitations already issued', () => {
  it('lists each one by the address it was issued to and its state', async () => {
    await render({ invitations: [invitation()] })

    expect(screen.getByText('rodzic@wp.pl')).toBeInTheDocument()
    expect(screen.getByText(/dla Ola Testowa · Oczekuje na wykorzystanie/)).toBeInTheDocument()
  })

  it('shows no code next to any of them', async () => {
    /** The row carries no plaintext because the database does not: the listing
     *  endpoint has nothing to send. */
    await render({ invitations: [invitation()] })

    expect(screen.queryByRole('region', { name: 'Kod zaproszenia' })).toBeNull()
    expect(screen.queryByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}/)).toBeNull()
  })

  it('offers no withdrawal for one that has been used', async () => {
    /** The account it created exists; deleting the row would not un-create it,
     *  and the backend refuses. */
    await render({
      invitations: [invitation({ status: 'used', usedAt: '2026-09-03T12:00:00Z' })],
    })

    expect(screen.getByText(/Konto zostało założone/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anuluj' })).toBeNull()
  })

  it('still offers to withdraw an expired one, which is only a dead row', async () => {
    await render({ invitations: [invitation({ status: 'expired' })] })

    expect(screen.getByText(/Kod wygasł/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anuluj' })).toBeInTheDocument()
  })

  it('redraws the list the server answers with after a withdrawal', async () => {
    mockedRevoke.mockResolvedValueOnce([])
    await render({ invitations: [invitation()] })

    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    expect(await screen.findByText(/Nie wystawiłeś jeszcze żadnego zaproszenia/))
      .toBeInTheDocument()
    expect(mockedRevoke).toHaveBeenCalledWith(invitation().id)
  })

  it('says a withdrawal that came too late may have been redeemed', async () => {
    mockedRevoke.mockRejectedValueOnce(new ApiError(404, null))
    await render({ invitations: [invitation()] })

    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    expect(await screen.findByText(/mogło zostać wykorzystane/)).toBeInTheDocument()
    expect(screen.getByText('rodzic@wp.pl')).toBeInTheDocument()
  })

  it('reports a failed withdrawal as a failed change, not as a failed load', async () => {
    mockedRevoke.mockRejectedValueOnce(new Error('500'))
    await render({ invitations: [invitation()] })

    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    expect(await screen.findByText(/Nie udało się anulować zaproszenia/)).toBeInTheDocument()
    expect(screen.queryByText(/Nie udało się wczytać/)).toBeNull()
  })
})
