import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { PAGE_SIZE } from '../hooks/usePagination'
import SpecialistPatients from './SpecialistPatients'
import { ApiError } from '../api/client'
import type { SpecialistCaseload, SpecialistPatient } from '../api/specialist'

vi.mock('../api/specialist', () => ({
  fetchCaseload: vi.fn(),
  invitePatient: vi.fn(),
  dropPatient: vi.fn(),
}))
const { dropPatient, fetchCaseload, invitePatient } = await import('../api/specialist')
const mockedFetch = vi.mocked(fetchCaseload)
const mockedInvite = vi.mocked(invitePatient)
const mockedDrop = vi.mocked(dropPatient)

/**
 * "Moi pacjenci". Four decisions on this screen are the client's rather than
 * the layout's, and each is a test below:
 *
 * - accepted and pending patients are two lists, because a pending invitation
 *   grants nothing at all — one list with a status badge is the shape in which
 *   somebody eventually renders a "Raporty" link on a row that never agreed;
 * - ending care asks twice, because the patient cannot undo it or restore it;
 * - the invite form says one thing however it refuses, so it cannot be used to
 *   ask who has an account here and what kind of care they are in;
 * - a locked account is named as locked, not drawn as an empty card a specialist
 *   would read as "stopped writing".
 */

function patient(overrides: Partial<SpecialistPatient> = {}): SpecialistPatient {
  return {
    id: 'p0000000-0000-0000-0000-000000000001',
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

function caseload(overrides: Partial<SpecialistCaseload> = {}): SpecialistCaseload {
  return { patients: [patient()], pending: [], ...overrides }
}

async function render(answer: SpecialistCaseload = caseload()) {
  mockedFetch.mockResolvedValue(answer)
  const result = renderWithProviders(<SpecialistPatients />)
  await waitFor(() => expect(screen.queryByText(/Wczytywanie listy pacjentów/)).toBeNull())
  return result
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedInvite.mockReset()
  mockedDrop.mockReset()
})

describe('the caseload', () => {
  it('names each patient and shows how much they have been writing', async () => {
    await render()

    expect(screen.getByRole('heading', { name: 'Ola Testowa' })).toBeInTheDocument()
    expect(screen.getByText('ola@wp.pl')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows nothing clinical on the card', async () => {
    /** The content is one screen further in, in the reports. A mood average in
     *  a list of nine patients is read at a glance and understood as a score,
     *  which is not what it is. */
    await render()

    for (const clinical of [/nastrój/i, /emocj/i, /stres/i, /ryzykown/i]) {
      expect(screen.queryByText(clinical)).toBeNull()
    }
  })

  it('links into the weekly reports, the one thing accepting opens', async () => {
    await render()

    expect(screen.getByRole('link', { name: /Raporty tygodniowe/ }))
      .toHaveAttribute('href', `/specialist/patients/${patient().id}/reports`)
  })

  it('marks a minor, because it changes what the specialist can do next', async () => {
    await render(caseload({ patients: [patient({ isChild: true })] }))

    expect(screen.getByText('Pacjent małoletni')).toBeInTheDocument()
  })

  it('says an empty caseload is empty, and that an invitation grants nothing', async () => {
    await render(caseload({ patients: [] }))

    expect(screen.getByText(/Nie masz jeszcze pacjentów/)).toBeInTheDocument()
    expect(screen.getByText(/nie widzisz żadnych jego danych/)).toBeInTheDocument()
  })

  it('never lets a failed load look like an empty caseload', async () => {
    /** A specialist who reads "nie masz pacjentów" goes looking for the
     *  invitation form rather than for the reason. */
    mockedFetch.mockRejectedValueOnce(new Error('503'))

    renderWithProviders(<SpecialistPatients />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się wczytać listy pacjentów.',
    )
    expect(screen.queryByText(/Nie masz jeszcze pacjentów/)).toBeNull()
  })
})

describe('a patient who withdrew their consents', () => {
  it('is said to be locked rather than drawn as an empty card', async () => {
    await render(caseload({
      patients: [patient({ consentsActive: false, activity: null })],
    }))

    expect(screen.getByText(/wycofał zgody na przetwarzanie danych/)).toBeInTheDocument()
    expect(screen.getByText(/Nic nie zostało usunięte/)).toBeInTheDocument()
  })

  it('is not offered a reports link that would only answer 403', async () => {
    await render(caseload({
      patients: [patient({ consentsActive: false, activity: null })],
    }))

    expect(screen.queryByRole('link', { name: /Raporty tygodniowe/ })).toBeNull()
  })

  it('is still listed — the lock is a fact about an account, not about health', async () => {
    await render(caseload({
      patients: [patient({ consentsActive: false, activity: null })],
    }))

    expect(screen.getByRole('heading', { name: 'Ola Testowa' })).toBeInTheDocument()
  })
})

describe('pending invitations', () => {
  const pending = patient({
    id: 'p0000000-0000-0000-0000-000000000002',
    name: 'Jan',
    surname: 'Nowak',
    acceptedAt: null,
    activity: null,
  })

  it('are a list of their own, apart from the patients who accepted', async () => {
    await render(caseload({ pending: [pending] }))

    const section = screen.getByRole('heading', { name: 'Oczekujące zaproszenia' })
      .parentElement!

    expect(within(section).getByText('Jan Nowak')).toBeInTheDocument()
  })

  it('carry no reports link and no figures', async () => {
    /** A pending invitation grants nothing: no reports, no figures, nothing. */
    await render(caseload({ patients: [], pending: [pending] }))

    expect(screen.queryByRole('link', { name: /Raporty tygodniowe/ })).toBeNull()
    expect(screen.queryByText('ostatni wpis')).toBeNull()
  })

  it('say in words that the patient has to confirm first', async () => {
    await render(caseload({ pending: [pending] }))

    expect(screen.getByText(/musi je potwierdzić w swojej aplikacji/)).toBeInTheDocument()
  })

  it('are withdrawn in one tap, because that takes nothing away', async () => {
    mockedDrop.mockResolvedValueOnce(caseload({ pending: [] }))
    await render(caseload({ patients: [], pending: [pending] }))

    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))

    expect(mockedDrop).toHaveBeenCalledWith(pending.id)
    await waitFor(() => expect(screen.queryByText('Jan Nowak')).toBeNull())
  })
})

describe('ending care', () => {
  it('asks before it does anything', async () => {
    /** TWO TAPS. The patient cannot undo this and cannot restore it — they
     *  would have to be invited again and accept again — so a stray tap on a
     *  phone would end a care relationship and drop the reports it exists for. */
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Zakończ opiekę' }))

    expect(screen.getByText(/Zakończyć opiekę nad Ola Testowa/)).toBeInTheDocument()
    expect(mockedDrop).not.toHaveBeenCalled()
  })

  it('says the patient cannot undo it themselves', async () => {
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Zakończ opiekę' }))

    expect(screen.getByText(/Pacjent nie może tego\s+cofnąć sam/)).toBeInTheDocument()
  })

  it('can be called off, and then nothing was sent', async () => {
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Zakończ opiekę' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nie kończ' }))

    expect(screen.queryByText(/Zakończyć opiekę/)).toBeNull()
    expect(mockedDrop).not.toHaveBeenCalled()
  })

  it('goes through on the second tap and redraws the list the server answers with', async () => {
    mockedDrop.mockResolvedValueOnce({ patients: [], pending: [] })
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Zakończ opiekę' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tak, zakończ' }))

    expect(mockedDrop).toHaveBeenCalledWith(patient().id)
    await waitFor(() => expect(screen.getByText(/Nie masz jeszcze pacjentów/)).toBeInTheDocument())
  })

  it('reports a failed change as a failed change, not as a failed load', async () => {
    /** Saying the list did not load sends the specialist to reload a screen
     *  whose content is already right. */
    mockedDrop.mockRejectedValueOnce(new Error('500'))
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Zakończ opiekę' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tak, zakończ' }))

    expect(await screen.findByText('Nie udało się zapisać zmiany. Spróbuj ponownie.'))
      .toBeInTheDocument()
    expect(screen.queryByText('Nie udało się wczytać listy pacjentów.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ola Testowa' })).toBeInTheDocument()
  })

  it('re-reads the list when the link had already gone', async () => {
    /** The row is gone on the server either way, so the screen must not be left
     *  showing a patient who is not there. */
    mockedDrop.mockRejectedValueOnce(new ApiError(404, null))
    mockedFetch.mockResolvedValue({ patients: [], pending: [] })
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Zakończ opiekę' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tak, zakończ' }))

    expect(await screen.findByText(/nie jest już Twoim pacjentem/)).toBeInTheDocument()
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2))
  })
})

describe('inviting a patient', () => {
  it('sends the trimmed address and redraws the caseload the server answers with', async () => {
    const pending = patient({ id: 'p-2', name: 'Jan', surname: 'Nowak', acceptedAt: null, activity: null })
    mockedInvite.mockResolvedValueOnce(caseload({ pending: [pending] }))
    await render()

    await userEvent.type(screen.getByLabelText('Adres e-mail pacjenta'), '  jan@wp.pl  ')
    await userEvent.click(screen.getByRole('button', { name: 'Zaproś' }))

    expect(mockedInvite).toHaveBeenCalledWith('jan@wp.pl')
    expect(await screen.findByText(/Zaproszenie wysłane na jan@wp.pl/)).toBeInTheDocument()
  })

  it('says the patient decides, and does not name a screen they may never see', async () => {
    /** A minor waiting for a guardian is redirected away from /home and answers
     *  on /link-guardian, so "na stronie głównej" would send the specialist
     *  looking for the wrong screen. */
    mockedInvite.mockResolvedValueOnce(caseload())
    await render()

    await userEvent.type(screen.getByLabelText('Adres e-mail pacjenta'), 'jan@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Zaproś' }))

    const notice = await screen.findByText(/Pacjent zobaczy je po zalogowaniu/)

    expect(notice).toBeInTheDocument()
    expect(notice.textContent).not.toMatch(/stronie głównej/)
  })

  it('cannot be submitted empty', async () => {
    await render()

    expect(screen.getByRole('button', { name: 'Zaproś' })).toBeDisabled()
  })

  it('shows the refusal the server worded, on the input that produced it', async () => {
    mockedInvite.mockRejectedValueOnce(
      new ApiError(400, null, { patient_email: 'Nie znaleziono pacjenta o tym adresie.' }),
    )
    await render()

    await userEvent.type(screen.getByLabelText('Adres e-mail pacjenta'), 'nikt@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Zaproś' }))

    expect(await screen.findByText('Nie znaleziono pacjenta o tym adresie.')).toBeInTheDocument()
    expect(screen.getByLabelText('Adres e-mail pacjenta')).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps the typed address after a refusal, so it can be corrected', async () => {
    mockedInvite.mockRejectedValueOnce(new ApiError(400, null, { patient_email: 'Nie znaleziono.' }))
    await render()

    await userEvent.type(screen.getByLabelText('Adres e-mail pacjenta'), 'nikt@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Zaproś' }))

    await screen.findByText('Nie znaleziono.')
    expect(screen.getByLabelText('Adres e-mail pacjenta')).toHaveValue('nikt@wp.pl')
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    mockedInvite.mockRejectedValueOnce(new Error('network'))
    await render()

    await userEvent.type(screen.getByLabelText('Adres e-mail pacjenta'), 'jan@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Zaproś' }))

    expect(await screen.findByText('Nie udało się wysłać zaproszenia. Spróbuj ponownie.'))
      .toBeInTheDocument()
  })

  it('says what accepting does and does not give the specialist', async () => {
    await render()

    expect(screen.getByText(/nie widzisz treści dzienniczka/)).toBeInTheDocument()
  })
})

describe('the caseload is paginated and the pending list is not', () => {
  /**
   * A full practice is dozens of patients and a card here is not a row — name,
   * address, three figures and, behind two taps, the control that ends the care
   * relationship. Fifty of them bury the invite form under the fold on the
   * specialist's own landing screen.
   *
   * The pending list stays whole: an invitation is answered or withdrawn, so it
   * does not accumulate — and there is one `?page=` to go round, so paginating
   * both would have the two lists turning each other's pages.
   */
  const manyPatients = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      patient({ id: `p-${index}`, name: 'Pacjent', surname: String(index), email: `p${index}@wp.pl` }),
    )

  it('shows seven patients on a page', async () => {
    await render(caseload({ patients: manyPatients(20) }))

    expect(screen.getByText(/Strona 1 z 3/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /^Pacjent \d+$/ })).toHaveLength(PAGE_SIZE)
  })

  it('counts patients in the range it prints', async () => {
    await render(caseload({ patients: manyPatients(20) }))

    expect(screen.getByText(/1–7 z 20 pacjentów/)).toBeInTheDocument()
  })

  it('draws no control when everything fits on one page', async () => {
    await render(caseload({ patients: manyPatients(PAGE_SIZE) }))

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('moves through the pages', async () => {
    await render(caseload({ patients: manyPatients(20) }))

    await userEvent.click(screen.getByRole('button', { name: /następna/i }))

    expect(screen.getByText(/Strona 2 z 3/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pacjent 7' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pacjent 0' })).toBeNull()
  })

  it('leaves the pending invitations whole, on every page of the caseload', async () => {
    // They are not counted by the control above them and they do not move with
    // it: a pending row grants nothing, and hiding one behind a page of
    // accepted patients would lose the only place it is visible.
    await render(
      caseload({
        patients: manyPatients(20),
        pending: [patient({ id: 'p-pending', name: 'Zofia', surname: 'Czeka', acceptedAt: null, activity: null })],
      }),
    )
    expect(screen.getByText('Zofia Czeka')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /następna/i }))

    expect(screen.getByText(/Strona 2 z 3/)).toBeInTheDocument()
    expect(screen.getByText('Zofia Czeka')).toBeInTheDocument()
    // Still 20 accepted patients, not 21: the two lists are counted apart.
    expect(screen.getByText(/z 20 pacjentów/)).toBeInTheDocument()
  })

  it('keeps the invite form reachable from any page', async () => {
    await render(caseload({ patients: manyPatients(20) }))

    await userEvent.click(screen.getByRole('button', { name: /następna/i }))

    expect(screen.getByLabelText('Adres e-mail pacjenta')).toBeInTheDocument()
  })
})
