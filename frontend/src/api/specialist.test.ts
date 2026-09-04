import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptSpecialistInvitation,
  createParentInvitation,
  dropPatient,
  fetchCaseload,
  fetchParentInvitations,
  fetchPatientReport,
  fetchSpecialistInvitation,
  invitePatient,
  rejectSpecialistInvitation,
  revokeParentInvitation,
} from './specialist'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn(), apiDownload: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

const PATIENT_ID = 'b0000000-0000-0000-0000-000000000009'

const ACCEPTED = {
  id: PATIENT_ID,
  name: 'Ola',
  surname: 'Testowa',
  email: 'ola@wp.pl',
  is_child: true,
  accepted_at: '2026-08-30T10:00:00Z',
  activity: { entry_count: 12, streak_days: 3, last_entry_date: '2026-09-03' },
}

const PENDING = {
  id: 'b0000000-0000-0000-0000-000000000010',
  name: 'Jan',
  surname: 'Nowak',
  email: 'jan@wp.pl',
  is_child: false,
  accepted_at: null,
  activity: null,
}

beforeEach(() => mockedRequest.mockReset())

describe('the caseload', () => {
  it('keeps accepted and pending patients apart', async () => {
    mockedRequest.mockResolvedValueOnce({ patients: [ACCEPTED], pending: [PENDING] })

    const caseload = await fetchCaseload()

    expect(mockedRequest).toHaveBeenCalledWith('/api/specialist/patients/')
    expect(caseload.patients).toEqual([
      {
        id: PATIENT_ID,
        name: 'Ola',
        surname: 'Testowa',
        email: 'ola@wp.pl',
        isChild: true,
        acceptedAt: '2026-08-30T10:00:00Z',
        activity: { entryCount: 12, streakDays: 3, lastEntryDate: '2026-09-03' },
      },
    ])
    expect(caseload.pending).toHaveLength(1)
  })

  it('reports no engagement at all for a patient who has not answered', async () => {
    // The whole point of the two lists: a pending invitation grants nothing, so
    // there is nothing to draw figures from.
    mockedRequest.mockResolvedValueOnce({ patients: [], pending: [PENDING] })

    const caseload = await fetchCaseload()

    expect(caseload.pending[0].activity).toBeNull()
    expect(caseload.pending[0].acceptedAt).toBeNull()
  })

  it('keeps a zero as a zero rather than losing it', async () => {
    mockedRequest.mockResolvedValueOnce({
      patients: [{ ...ACCEPTED, activity: { entry_count: 0, streak_days: 0, last_entry_date: null } }],
      pending: [],
    })

    const [patient] = (await fetchCaseload()).patients

    expect(patient.activity).toEqual({ entryCount: 0, streakDays: 0, lastEntryDate: null })
  })

  it('never puts id_medical on the wire — the id is the user row', async () => {
    mockedRequest.mockResolvedValueOnce({ patients: [ACCEPTED], pending: [] })

    const [patient] = (await fetchCaseload()).patients

    expect(Object.keys(patient)).not.toContain('idMedical')
  })

  it('invites by e-mail and answers with the updated caseload', async () => {
    mockedRequest.mockResolvedValueOnce({ patients: [], pending: [PENDING] })

    const caseload = await invitePatient('jan@wp.pl')

    expect(mockedRequest).toHaveBeenCalledWith('/api/specialist/patients/', {
      method: 'POST',
      body: { patient_email: 'jan@wp.pl' },
    })
    expect(caseload.pending).toHaveLength(1)
  })

  it('drops a link by the patient id in the URL', async () => {
    mockedRequest.mockResolvedValueOnce({ patients: [], pending: [] })

    await dropPatient(PATIENT_ID)

    expect(mockedRequest).toHaveBeenCalledWith(
      `/api/specialist/patients/${PATIENT_ID}/`, { method: 'DELETE' },
    )
  })
})

describe('a patient’s reports', () => {
  it('reads them through the specialist URL, not /api/reports/', async () => {
    // The path is where the "is this your patient" check happens, so it is the
    // one thing about this call that must not drift.
    mockedRequest.mockResolvedValueOnce({
      id: 'week-2026-08-24',
      week_start: '2026-08-24',
      week_end: '2026-08-30',
      range_label: '24–30 sierpnia',
      entry_count: 5,
      metrics: [],
      emotions: [],
      triggers: [],
      risky_days: [],
      changes: [],
      summary: 'Podsumowanie.',
    })

    const report = await fetchPatientReport(PATIENT_ID, 'week-2026-08-24')

    expect(mockedRequest).toHaveBeenCalledWith(
      `/api/specialist/patients/${PATIENT_ID}/reports/week-2026-08-24/`,
    )
    // Mapped by the same function the patient's own screen uses.
    expect(report.rangeLabel).toBe('24–30 sierpnia')
    expect(report.entryCount).toBe(5)
  })
})

describe('the guardian invitations a specialist issues', () => {
  const INVITATION = {
    id: 'e0000000-0000-0000-0000-000000000001',
    email: 'rodzic@wp.pl',
    child_id: PATIENT_ID,
    child_name: 'Ola',
    child_surname: 'Testowa',
    child_email: 'ola@wp.pl',
    created_at: '2026-09-01T08:00:00Z',
    expires_at: '2026-09-15T08:00:00Z',
    used_at: null,
    status: 'pending' as const,
  }

  it('maps a listed invitation and carries no code', async () => {
    mockedRequest.mockResolvedValueOnce([INVITATION])

    const [invitation] = await fetchParentInvitations()

    expect(invitation).toEqual({
      id: INVITATION.id,
      email: 'rodzic@wp.pl',
      childId: PATIENT_ID,
      childName: 'Ola',
      childSurname: 'Testowa',
      childEmail: 'ola@wp.pl',
      createdAt: '2026-09-01T08:00:00Z',
      expiresAt: '2026-09-15T08:00:00Z',
      usedAt: null,
      status: 'pending',
    })
    expect(invitation).not.toHaveProperty('code')
  })

  it('returns the plaintext code only from the call that creates one', async () => {
    mockedRequest.mockResolvedValueOnce({ code: 'ABCD-EFGH-JKMN', invitation: INVITATION })

    const issued = await createParentInvitation({
      patientId: PATIENT_ID,
      parentEmail: 'rodzic@wp.pl',
    })

    expect(mockedRequest).toHaveBeenCalledWith('/api/specialist/parent-invitations/', {
      method: 'POST',
      body: { patient_id: PATIENT_ID, parent_email: 'rodzic@wp.pl' },
    })
    expect(issued.code).toBe('ABCD-EFGH-JKMN')
    expect(issued.invitation.email).toBe('rodzic@wp.pl')
  })

  it('revokes by id and answers with what is left', async () => {
    mockedRequest.mockResolvedValueOnce([])

    expect(await revokeParentInvitation(INVITATION.id)).toEqual([])
    expect(mockedRequest).toHaveBeenCalledWith(
      `/api/specialist/parent-invitations/${INVITATION.id}/`, { method: 'DELETE' },
    )
  })
})

describe('the patient’s side of an invitation', () => {
  it('unwraps the invitation, and null when nobody has asked', async () => {
    mockedRequest.mockResolvedValueOnce({ invitation: null })

    expect(await fetchSpecialistInvitation()).toBeNull()
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/account/specialist-invitation/', undefined,
    )
  })

  it('names the specialist rather than only their address', async () => {
    mockedRequest.mockResolvedValueOnce({
      invitation: {
        specialist: 'Anna Terapeutka',
        email: 'anna@wp.pl',
        approach: 'psychoterapia poznawczo-behawioralna',
      },
    })

    expect(await fetchSpecialistInvitation()).toEqual({
      specialist: 'Anna Terapeutka',
      email: 'anna@wp.pl',
      approach: 'psychoterapia poznawczo-behawioralna',
    })
  })

  it('accepts and rejects through their own URLs', async () => {
    mockedRequest.mockResolvedValueOnce({ invitation: null })
    await acceptSpecialistInvitation()
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/account/specialist-invitation/accept/', { method: 'POST' },
    )

    mockedRequest.mockResolvedValueOnce({ invitation: null })
    await rejectSpecialistInvitation()
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/account/specialist-invitation/reject/', { method: 'POST' },
    )
  })
})
