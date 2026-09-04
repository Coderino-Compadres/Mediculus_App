/**
 * The specialist panel's endpoints: /api/specialist/, plus the patient's side of
 * an invitation (/api/account/specialist-invitation/).
 *
 * A mapping layer like api/guardian.ts — snake_case columns in, camelCase out —
 * with one thing worth knowing before touching it: **a patient's report is
 * fetched through their own URL under /api/specialist/**, not through
 * /api/reports/. The payload is identical (both come from
 * `core.reports.build_weekly_reports`), so the mapping is reused from
 * api/reports.ts rather than copied; only the path differs, because the path is
 * where the "is this your patient" check happens.
 */

import { apiDownload, apiRequest } from './client'
import { toReport, type ReportPayload } from './reports'
import type { WeeklyReport } from '../types/report'

/** As `core.account.build_child_activity` returns it — shared with the parent panel. */
interface PatientActivityPayload {
  entry_count: number
  streak_days: number
  last_entry_date: string | null
}

/** As `core.specialist.serialize_patient` returns it. */
interface SpecialistPatientPayload {
  id: string
  name: string | null
  surname: string | null
  email: string | null
  is_child: boolean | null
  accepted_at: string | null
  consents_active?: boolean
  activity: PatientActivityPayload | null
}

interface PatientListPayload {
  patients: SpecialistPatientPayload[]
  pending: SpecialistPatientPayload[]
}

export interface PatientActivity {
  entryCount: number
  streakDays: number
  lastEntryDate: string | null
}

export interface SpecialistPatient {
  /** The patient's `user` id — what the report URLs carry. Never `id_medical`,
   *  which is the pseudonymized key medical_db is keyed on and does not belong
   *  in a browser. */
  id: string
  name: string | null
  surname: string | null
  email: string | null
  isChild: boolean | null
  /** When the patient agreed to this specialist; null on a pending invitation. */
  acceptedAt: string | null
  /**
   * Whether the patient's own RODO consents are in force.
   *
   * False means their account is locked, the app has stopped deriving anything
   * from their diary, and their reports are refused (403) — see
   * `specialist.patient_locked`. It travels so the card can say that rather than
   * showing an empty row the specialist would read as "stopped writing".
   */
  consentsActive: boolean
  /**
   * How much they have been writing — null on a pending invitation.
   *
   * Engagement only, never content: the content is the weekly reports, which are
   * a document you open deliberately rather than a figure in a list. See
   * PATIENT_SUMMARY_FIELDS in core/specialist.py.
   */
  activity: PatientActivity | null
}

export interface SpecialistCaseload {
  /** Patients who accepted. These are the ones whose reports can be opened. */
  patients: SpecialistPatient[]
  /** Patients who were asked and have not answered. These grant nothing. */
  pending: SpecialistPatient[]
}

function toPatient(payload: SpecialistPatientPayload): SpecialistPatient {
  return {
    id: payload.id,
    name: payload.name,
    surname: payload.surname,
    email: payload.email,
    isChild: payload.is_child,
    acceptedAt: payload.accepted_at,
    consentsActive: payload.consents_active ?? true,
    activity: payload.activity && {
      entryCount: payload.activity.entry_count,
      streakDays: payload.activity.streak_days,
      lastEntryDate: payload.activity.last_entry_date,
    },
  }
}

function toCaseload(payload: PatientListPayload): SpecialistCaseload {
  return {
    patients: payload.patients.map(toPatient),
    pending: payload.pending.map(toPatient),
  }
}

export async function fetchCaseload(): Promise<SpecialistCaseload> {
  return toCaseload(await apiRequest<PatientListPayload>('/api/specialist/patients/'))
}

/**
 * Asks the patient at that address to be treated by the signed-in specialist.
 *
 * Creates a request, not an assignment: the patient answers on their own screen.
 * Every way the address can fail comes back as one message under
 * `patient_email` — see SpecialistPatientInviteSerializer for why they are not
 * told apart.
 */
export async function invitePatient(patientEmail: string): Promise<SpecialistCaseload> {
  return toCaseload(
    await apiRequest<PatientListPayload>('/api/specialist/patients/', {
      method: 'POST',
      body: { patient_email: patientEmail },
    }),
  )
}

/**
 * Ends the relationship, or withdraws an unanswered request.
 *
 * The specialist is the only side that can do this to an accepted link — the
 * client's rule, for a clinical reason: see pages/Reports.tsx.
 */
export async function dropPatient(patientId: string): Promise<SpecialistCaseload> {
  return toCaseload(
    await apiRequest<PatientListPayload>(
      `/api/specialist/patients/${encodeURIComponent(patientId)}/`,
      { method: 'DELETE' },
    ),
  )
}

/** One patient's weekly reports. 404 for anyone who is not this specialist's. */
export async function fetchPatientReports(patientId: string): Promise<WeeklyReport[]> {
  const payload = await apiRequest<ReportPayload[]>(
    `/api/specialist/patients/${encodeURIComponent(patientId)}/reports/`,
  )
  return payload.map(toReport)
}

export async function fetchPatientReport(
  patientId: string,
  reportId: string,
): Promise<WeeklyReport> {
  return toReport(
    await apiRequest<ReportPayload>(
      `/api/specialist/patients/${encodeURIComponent(patientId)}/reports/${encodeURIComponent(reportId)}/`,
    ),
  )
}

export async function fetchPatientReportPdf(
  patientId: string,
  reportId: string,
): Promise<Blob> {
  return apiDownload(
    `/api/specialist/patients/${encodeURIComponent(patientId)}/reports/${encodeURIComponent(reportId)}/pdf/`,
  )
}

/** As `core.parent_invitations.serialize_invitation` returns it — never a code. */
interface ParentInvitationPayload {
  id: string
  email: string
  child_id: string
  child_name: string | null
  child_surname: string | null
  child_email: string | null
  created_at: string | null
  expires_at: string
  used_at: string | null
  status: ParentInvitationStatus
}

/** Mirrors STATUS_* in core/parent_invitations.py. */
export type ParentInvitationStatus = 'pending' | 'used' | 'expired'

export interface ParentInvitation {
  id: string
  email: string
  childId: string
  childName: string | null
  childSurname: string | null
  childEmail: string | null
  createdAt: string | null
  expiresAt: string
  usedAt: string | null
  status: ParentInvitationStatus
}

function toParentInvitation(payload: ParentInvitationPayload): ParentInvitation {
  return {
    id: payload.id,
    email: payload.email,
    childId: payload.child_id,
    childName: payload.child_name,
    childSurname: payload.child_surname,
    childEmail: payload.child_email,
    createdAt: payload.created_at,
    expiresAt: payload.expires_at,
    usedAt: payload.used_at,
    status: payload.status,
  }
}

export async function fetchParentInvitations(): Promise<ParentInvitation[]> {
  const payload = await apiRequest<ParentInvitationPayload[]>(
    '/api/specialist/parent-invitations/',
  )
  return payload.map(toParentInvitation)
}

export interface IssuedParentInvitation {
  /**
   * The code, in plaintext, **for this response only**.
   *
   * It is stored hashed, so nothing can read it back — not this API, not the
   * list above, not the database. The screen has to show it while it has it and
   * say so; a specialist who loses it revokes the invitation and issues another.
   */
  code: string
  invitation: ParentInvitation
}

export interface NewParentInvitation {
  patientId: string
  parentEmail: string
}

export async function createParentInvitation(
  input: NewParentInvitation,
): Promise<IssuedParentInvitation> {
  const payload = await apiRequest<{ code: string; invitation: ParentInvitationPayload }>(
    '/api/specialist/parent-invitations/',
    {
      method: 'POST',
      body: { patient_id: input.patientId, parent_email: input.parentEmail },
    },
  )
  return { code: payload.code, invitation: toParentInvitation(payload.invitation) }
}

/** API field name -> form field name, so a 400 lands under the right input. */
export const PARENT_INVITATION_FIELDS: Record<string, string> = {
  patient_id: 'patientId',
  parent_email: 'parentEmail',
}

export const PATIENT_INVITE_FIELDS: Record<string, string> = {
  patient_email: 'patientEmail',
}

/** Withdraws an unredeemed code. A redeemed one is a record and is not deletable. */
export async function revokeParentInvitation(id: string): Promise<ParentInvitation[]> {
  const payload = await apiRequest<ParentInvitationPayload[]>(
    `/api/specialist/parent-invitations/${encodeURIComponent(id)}/`,
    { method: 'DELETE' },
  )
  return payload.map(toParentInvitation)
}

/** As `core.specialist.pending_invitation` returns it. */
interface SpecialistInvitationPayload {
  specialist: string | null
  email: string | null
  approach: string | null
}

export interface SpecialistInvitation {
  /** The specialist's name, or their address when the row carries no name. */
  specialist: string | null
  email: string | null
  /** `specjalist.specjalization` — what they entered at registration. */
  approach: string | null
}

async function invitationRequest(
  path: string,
  method?: 'POST',
): Promise<SpecialistInvitation | null> {
  const payload = await apiRequest<{ invitation: SpecialistInvitationPayload | null }>(
    path,
    method ? { method } : undefined,
  )
  return payload.invitation
}

/** The invitation waiting for the signed-in patient, or null when there is none. */
export function fetchSpecialistInvitation(): Promise<SpecialistInvitation | null> {
  return invitationRequest('/api/account/specialist-invitation/')
}

/**
 * The patient agrees to be treated by that specialist.
 *
 * From here on the specialist can read this patient's weekly reports, and the
 * patient cannot undo it — dropping the link is the specialist's action (the
 * client's rule; see pages/Reports.tsx). The screen says so before the tap.
 */
export function acceptSpecialistInvitation(): Promise<SpecialistInvitation | null> {
  return invitationRequest('/api/account/specialist-invitation/accept/', 'POST')
}

export function rejectSpecialistInvitation(): Promise<SpecialistInvitation | null> {
  return invitationRequest('/api/account/specialist-invitation/reject/', 'POST')
}
