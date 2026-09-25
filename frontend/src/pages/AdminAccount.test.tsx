import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, TEST_USER } from '../test/render'
import AdminAccount from './AdminAccount'
import { ApiError } from '../api/client'
import { adminAccountPath, ROUTES } from '../routes'
import type { AccountDetail } from '../api/admin'

vi.mock('../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin')>()),
  fetchAccount: vi.fn(),
}))
const { fetchAccount } = await import('../api/admin')
const mockedAccount = vi.mocked(fetchAccount)

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
    activity: {
      diaryEntries: { count: 12, last: '2026-09-19' },
      meals: { count: 53, last: '2026-09-20' },
      hydrationEntries: { count: 0, last: null },
      activities: { count: 0, last: null },
      sleepNights: { count: 0, last: null },
      supplements: 2,
      healthProfile: false,
    },
  },
}

beforeEach(() => {
  mockedAccount.mockReset()
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
  it('shows the account, its links and its counts', async () => {
    mockedAccount.mockResolvedValue(PATIENT)

    renderAt('p1')

    expect(await screen.findByRole('heading', { level: 1, name: 'Zuzia Dieta' })).toBeInTheDocument()
    expect(mockedAccount).toHaveBeenCalledWith('p1')
    expect(screen.getByText('zatwierdzone przez opiekuna')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mama Zuzi' })).toHaveAttribute(
      'href', adminAccountPath('g1'),
    )
    expect(screen.getByRole('link', { name: 'Anna Kowalska' })).toBeInTheDocument()
    expect(screen.getByText('53')).toBeInTheDocument()
    expect(screen.getByText('ostatni: 20 września 2026')).toBeInTheDocument()
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
