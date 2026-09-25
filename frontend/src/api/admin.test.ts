import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accountFlags,
  approveSpecialist,
  auditActionLabel,
  fetchAccount,
  fetchAccounts,
  fetchPendingSpecialists,
  rejectSpecialist,
} from './admin'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

beforeEach(() => {
  mockedRequest.mockReset()
})

const PENDING_PAYLOAD = {
  id: 'cccc-3333',
  name: 'Nowa',
  surname: 'Terapeutka',
  email: 'nowa@wp.pl',
  specialization: 'DBT',
  module: 'psychotherapy',
  module_label: 'Psychoterapia',
  created_at: '2026-09-20T10:00:00+02:00',
  created_by: { id: 'aaaa-1111', name: 'Anna', surname: 'Kowalska', email: 'anna@wp.pl' },
  consents_active: false,
  password_set: false,
}

describe('the specialist decisions', () => {
  it('maps the waiting accounts', async () => {
    mockedRequest.mockResolvedValue([PENDING_PAYLOAD])

    const rows = await fetchPendingSpecialists()

    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/specialists/pending/')
    expect(rows).toEqual([{
      id: 'cccc-3333',
      name: 'Nowa',
      surname: 'Terapeutka',
      email: 'nowa@wp.pl',
      specialization: 'DBT',
      moduleLabel: 'Psychoterapia',
      createdAt: '2026-09-20T10:00:00+02:00',
      createdBy: { id: 'aaaa-1111', name: 'Anna', surname: 'Kowalska', email: 'anna@wp.pl' },
      consentsActive: false,
      passwordSet: false,
    }])
  })

  it('approves and rejects by POST, each under /api/', async () => {
    mockedRequest.mockResolvedValue([])

    await approveSpecialist('cccc-3333')
    await rejectSpecialist('cccc-3333')

    expect(mockedRequest).toHaveBeenNthCalledWith(
      1, '/api/admin/specialists/cccc-3333/approve/', { method: 'POST' },
    )
    expect(mockedRequest).toHaveBeenNthCalledWith(
      2, '/api/admin/specialists/cccc-3333/reject/', { method: 'POST' },
    )
  })
})

describe('the account list', () => {
  it('asks for one kind when told to', async () => {
    mockedRequest.mockResolvedValue([])

    await fetchAccounts('patient')

    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/accounts/?kind=patient')
  })

  it('files a kind this build does not know under "other" rather than dropping it', async () => {
    mockedRequest.mockResolvedValue([{
      id: 'x', name: null, surname: null, email: 'x@wp.pl', kind: 'robot', role: null,
      created_at: null, consents_active: true, must_change_password: false,
      specialist_approved: null, specialist_module: null, is_child: null,
    }])

    const [row] = await fetchAccounts()

    expect(row.kind).toBe('other')
  })

  it('names the states worth a tag, and nothing for an ordinary account', () => {
    const base = {
      id: 'x', name: null, surname: null, email: null, kind: 'patient' as const, role: null,
      createdAt: null, consentsActive: true, mustChangePassword: false,
      specialistApproved: null, isChild: null,
    }

    expect(accountFlags(base)).toEqual([])
    expect(accountFlags({
      ...base, specialistApproved: false, consentsActive: false, mustChangePassword: true,
    })).toEqual(['czeka na weryfikację', 'bez aktywnych zgód', 'hasło tymczasowe'])
  })
})

describe('one account', () => {
  it('maps a patient’s counts without any record content', async () => {
    mockedRequest.mockResolvedValue({
      id: 'p1', name: 'Zuzia', surname: 'Dieta', email: 'zuzia@wp.pl', kind: 'patient',
      role: 'patient', created_at: null, updated_at: null, date_of_birth: '2012-03-04',
      consents_active: true, must_change_password: false, specialist_approved: null,
      specialist_module: null, is_child: true, specialist: null, guardian: null,
      patient: {
        is_child: true, guardian_status: 'pending', guardians: [], specialists: [],
        activity: {
          diary_entries: { count: 3, last: '2026-09-01' },
          meals: { count: 0, last: null },
          hydration_entries: { count: 0, last: null },
          activities: { count: 0, last: null },
          sleep_nights: { count: 0, last: null },
          supplements: 0,
          health_profile: true,
        },
      },
    })

    const account = await fetchAccount('p1')

    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/accounts/p1/')
    expect(account.patient?.activity.diaryEntries).toEqual({ count: 3, last: '2026-09-01' })
    expect(account.patient?.activity.healthProfile).toBe(true)
    expect(account.patient?.guardianStatus).toBe('pending')
  })
})

describe('the audit log vocabulary', () => {
  it('has a word for every action the backend records', () => {
    for (const action of [
      'view_overview', 'view_accounts', 'view_account', 'view_pending_specialists',
      'approve_specialist', 'reject_specialist',
    ]) {
      expect(auditActionLabel(action)).not.toBe(action)
    }
  })

  it('prints an unknown action as itself rather than nothing', () => {
    expect(auditActionLabel('toString')).toBe('toString')
    expect(auditActionLabel('export_everything')).toBe('export_everything')
  })
})
