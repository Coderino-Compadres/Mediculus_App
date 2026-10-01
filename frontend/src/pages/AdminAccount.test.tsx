import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, TEST_USER } from '../test/render'
import AdminAccount from './AdminAccount'
import { ApiError } from '../api/client'
import { adminAccountPath, ROUTES } from '../routes'
import type { AccountDetail } from '../api/admin'

vi.mock('../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin')>()),
  fetchAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
}))
const { fetchAccount, updateAccount, deleteAccount } = await import('../api/admin')
const mockedAccount = vi.mocked(fetchAccount)
const mockedUpdate = vi.mocked(updateAccount)
const mockedDelete = vi.mocked(deleteAccount)

const ADMIN = { ...TEST_USER, role: 'admin', isPatient: false, isChild: null, isAdmin: true }

const PATIENT: AccountDetail = {
  id: 'p1',
  name: 'Zuzia',
  surname: 'Dieta',
  email: 'zuzia@wp.pl',
  kind: 'patient',
  role: 'patient',
  createdAt: '2026-08-28T10:00:00+02:00',
  updatedAt: '2026-09-20T10:00:00+02:00',
  consentsActive: true,
  mustChangePassword: false,
  specialistApproved: null,
  isChild: true,
  dateOfBirth: '2012-03-04',
  specialist: null,
  guardian: null,
  patient: {
    isChild: true,
    guardianStatus: 'accepted',
    guardians: [
      { id: 'g1', name: 'Mama', surname: 'Zuzi', email: 'mama@wp.pl', accepted: true, moduleLabel: null },
    ],
    specialists: [
      {
        id: 's1', name: 'Anna', surname: 'Kowalska', email: 'anna@wp.pl',
        accepted: true, moduleLabel: 'Psychoterapia',
      },
    ],
  },
}

const SPECIALIST: AccountDetail = {
  ...PATIENT,
  id: 's9',
  name: 'Anna',
  surname: 'Kowalska',
  email: 'anna@wp.pl',
  kind: 'specialist',
  role: 'specjalista',
  isChild: null,
  dateOfBirth: '1985-02-01',
  patient: null,
  specialist: {
    specialization: 'DBT',
    qualifications: {
      university: 'Uniwersytet Jagielloński',
      fieldOfStudy: 'Psychologia',
      diplomaNumber: '987/2012',
    },
    module: 'psychotherapy',
    moduleLabel: 'Psychoterapia',
    approvedAt: '2026-09-01T10:00:00+02:00',
    createdBy: null,
    patients: [],
  },
}

const ANOTHER_ADMIN: AccountDetail = {
  ...PATIENT,
  id: 'a2',
  name: 'Drugi',
  surname: 'Admin',
  email: 'drugi@wp.pl',
  kind: 'admin',
  role: 'admin',
  isChild: null,
  patient: null,
}

beforeEach(() => {
  mockedAccount.mockReset()
  mockedUpdate.mockReset()
  mockedDelete.mockReset()
})

function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path={ROUTES.adminAccount} element={<AdminAccount />} />
    </Routes>,
    { user: ADMIN, route: adminAccountPath(id) },
  )
}

describe('AdminAccount', () => {
  it('lists a specialist’s university, field of study and diploma number', async () => {
    mockedAccount.mockResolvedValue({
      ...PATIENT,
      kind: 'specialist',
      role: 'specjalista',
      isChild: null,
      patient: null,
      specialist: {
        specialization: 'DBT',
        qualifications: {
          university: 'Uniwersytet Jagielloński',
          fieldOfStudy: 'Psychologia',
          diplomaNumber: '987/2012',
        },
        module: 'psychotherapy',
        moduleLabel: 'Psychoterapia',
        approvedAt: null,
        createdBy: null,
        patients: [],
      },
    })

    renderAt('p1')

    expect(await screen.findByText('Uniwersytet Jagielloński')).toBeInTheDocument()
    expect(screen.getByText('Psychologia')).toBeInTheDocument()
    expect(screen.getByText('987/2012')).toBeInTheDocument()
  })

  it('shows the account and its links', async () => {
    mockedAccount.mockResolvedValue(PATIENT)

    renderAt('p1')

    expect(await screen.findByRole('heading', { level: 1, name: 'Zuzia Dieta' })).toBeInTheDocument()
    expect(mockedAccount).toHaveBeenCalledWith('p1')
    expect(screen.getByText('zatwierdzone przez opiekuna')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mama Zuzi' })).toHaveAttribute(
      'href', adminAccountPath('g1'),
    )
    expect(screen.getByRole('link', { name: 'Anna Kowalska' })).toBeInTheDocument()
  })

  it('shows nothing of a patient’s activity', async () => {
    mockedAccount.mockResolvedValue(PATIENT)

    renderAt('p1')

    expect(await screen.findByText(/Dane medyczne pacjenta nie są dostępne/)).toBeInTheDocument()
    expect(screen.queryByText('Aktywność')).toBeNull()
    expect(screen.queryByText(/wpisy w dzienniczku/)).toBeNull()
  })

  it('says the look was recorded', async () => {
    mockedAccount.mockResolvedValue(PATIENT)

    renderAt('p1')

    expect(await screen.findByText(/zapisane w dzienniku działań/)).toBeInTheDocument()
  })

  it('tells a deleted account apart from a failed load', async () => {
    mockedAccount.mockRejectedValue(new ApiError(404, 'Nie znaleziono takiego konta.'))

    renderAt('gone')

    expect(await screen.findByText(/Nie ma takiego konta/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).toBeNull()
  })

  it('offers a retry when the load itself failed', async () => {
    mockedAccount.mockRejectedValue(new ApiError(0, null))

    renderAt('p1')

    expect(await screen.findByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
  })
})

describe('AdminAccount — correcting a specialist’s account', () => {
  async function openForm() {
    await userEvent.click(await screen.findByRole('button', { name: 'Zmień dane konta' }))
  }

  it('sends only what changed, trimmed', async () => {
    mockedAccount.mockResolvedValue(SPECIALIST)
    mockedUpdate.mockResolvedValue({ ...SPECIALIST, surname: 'Nowak' })
    renderAt('s9')

    await openForm()
    await userEvent.clear(screen.getByLabelText('Nazwisko'))
    await userEvent.type(screen.getByLabelText('Nazwisko'), ' Nowak ')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(mockedUpdate).toHaveBeenCalledWith('s9', { lastName: 'Nowak' })
    expect(await screen.findByText('Zapisano zmiany.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Anna Nowak' })).toBeInTheDocument()
  })

  it('cannot be saved while nothing has changed', async () => {
    mockedAccount.mockResolvedValue(SPECIALIST)
    renderAt('s9')

    await openForm()

    expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeDisabled()
  })

  it('says the account was signed out when the address changed', async () => {
    mockedAccount.mockResolvedValue(SPECIALIST)
    mockedUpdate.mockResolvedValue({ ...SPECIALIST, email: 'nowy@wp.pl' })
    renderAt('s9')

    await openForm()
    await userEvent.clear(screen.getByLabelText('Adres e-mail'))
    await userEvent.type(screen.getByLabelText('Adres e-mail'), 'nowy@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(await screen.findByText(/wylogowane ze wszystkich urządzeń/)).toBeInTheDocument()
  })

  it('puts the backend’s refusal under the field it is about', async () => {
    mockedAccount.mockResolvedValue(SPECIALIST)
    mockedUpdate.mockRejectedValue(
      new ApiError(400, null, { date_of_birth: 'Konto specjalisty może mieć wyłącznie osoba pełnoletnia.' }),
    )
    renderAt('s9')

    await openForm()
    await userEvent.clear(screen.getByLabelText('Data urodzenia'))
    await userEvent.type(screen.getByLabelText('Data urodzenia'), '2015-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(await screen.findByText(/wyłącznie osoba pełnoletnia/)).toBeInTheDocument()
    expect(screen.getByLabelText('Data urodzenia')).toHaveAttribute('aria-invalid', 'true')
  })

  it('corrects a specialist’s diploma number and module', async () => {
    mockedAccount.mockResolvedValue(SPECIALIST)
    mockedUpdate.mockResolvedValue(SPECIALIST)
    renderAt('s9')

    await openForm()
    await userEvent.clear(screen.getByLabelText('Numer dyplomu'))
    await userEvent.type(screen.getByLabelText('Numer dyplomu'), '988/2012')
    await userEvent.selectOptions(screen.getByLabelText('Moduł'), 'diet')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(mockedUpdate).toHaveBeenCalledWith('s9', { diplomaNumber: '988/2012', module: 'diet' })
  })

  it('shows a refused module change under the module', async () => {
    /** core/admin_panel.py refuses it while the specialist has techniques in
     *  the current module — they would be left with nobody able to edit them. */
    mockedAccount.mockResolvedValue(SPECIALIST)
    mockedUpdate.mockRejectedValue(
      new ApiError(400, null, { module: 'Ten specjalista ma opublikowane techniki w obecnym module.' }),
    )
    renderAt('s9')

    await openForm()
    await userEvent.selectOptions(screen.getByLabelText('Moduł'), 'diet')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(await screen.findByText(/opublikowane techniki w obecnym module/)).toBeInTheDocument()
    expect(screen.getByLabelText('Moduł')).toHaveAttribute('aria-invalid', 'true')
  })

  it('offers no editing on a patient’s, a guardian’s or an administrator’s account', async () => {
    for (const account of [PATIENT, { ...PATIENT, kind: 'guardian' as const, patient: null }, ANOTHER_ADMIN]) {
      mockedAccount.mockResolvedValue(account)
      const { unmount } = renderAt(account.id)

      expect(await screen.findByRole('button', { name: 'Usuń konto' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Zmień dane konta' })).toBeNull()
      unmount()
    }
  })
})

describe('AdminAccount — deleting an account', () => {
  async function openConfirmation() {
    await userEvent.click(await screen.findByRole('button', { name: 'Usuń konto' }))
  }

  it('never deletes on the first click', async () => {
    mockedAccount.mockResolvedValue(PATIENT)
    renderAt('p1')

    await openConfirmation()

    expect(mockedDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Usuń konto na stałe' })).toBeDisabled()
  })

  it('says a patient’s medical records go too, without counting them', async () => {
    mockedAccount.mockResolvedValue(PATIENT)
    renderAt('p1')

    await openConfirmation()

    const confirmation = screen.getByRole('form', { name: 'Potwierdzenie usunięcia konta' })
    expect(within(confirmation).getByText(/Wszystkie dane medyczne pacjenta/)).toBeInTheDocument()
    expect(within(confirmation).queryByText(/\d/)).toBeNull()
  })

  it('deletes once the address is typed, and says whose account it was', async () => {
    mockedAccount.mockResolvedValue(PATIENT)
    mockedDelete.mockResolvedValue()
    renderAt('p1')

    await openConfirmation()
    await userEvent.type(screen.getByLabelText(/Aby potwierdzić, wpisz/), 'ZUZIA@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Usuń konto na stałe' }))

    expect(mockedDelete).toHaveBeenCalledWith('p1')
    expect(await screen.findByText(/Usunięto konto: Zuzia Dieta/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zmień dane konta' })).toBeNull()
  })

  it('stays put and says so when the deletion is refused', async () => {
    mockedAccount.mockResolvedValue(PATIENT)
    mockedDelete.mockRejectedValue(new ApiError(0, null))
    renderAt('p1')

    await openConfirmation()
    await userEvent.type(screen.getByLabelText(/Aby potwierdzić, wpisz/), 'zuzia@wp.pl')
    await userEvent.click(screen.getByRole('button', { name: 'Usuń konto na stałe' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nie udało się usunąć konta/i)
    expect(screen.getByRole('heading', { level: 1, name: 'Zuzia Dieta' })).toBeInTheDocument()
  })

  it('tells a specialist’s patients keep their records', async () => {
    mockedAccount.mockResolvedValue(SPECIALIST)
    renderAt('s9')

    await openConfirmation()

    expect(screen.getByText(/Ich dane zostają nietknięte/)).toBeInTheDocument()
  })
})

describe('AdminAccount — an administrator’s account', () => {
  it('can delete another administrator, with its own consequences', async () => {
    mockedAccount.mockResolvedValue(ANOTHER_ADMIN)
    renderAt('a2')

    await userEvent.click(await screen.findByRole('button', { name: 'Usuń konto' }))

    expect(screen.getByText(/dostęp do panelu/)).toBeInTheDocument()
  })

  it('offers no deleting on the signed-in administrator’s own account', async () => {
    mockedAccount.mockResolvedValue({ ...ANOTHER_ADMIN, id: ADMIN.id })
    renderAt(ADMIN.id)

    expect(await screen.findByText(/To Twoje konto/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usuń konto' })).toBeNull()
  })
})
