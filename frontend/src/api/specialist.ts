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
import { toDietReport, type DietReportPayload } from './diet'
import { toReport, type ReportPayload } from './reports'
import { MODULE_PSYCHOTHERAPY, moduleLabel, type AppModule } from '../utils/modules'
import type { DietWeeklyReport } from '../types/dietReport'
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
  module?: AppModule
  module_label?: string
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
   * Which module this relationship is about.
   *
   * **A ROW IS A RELATIONSHIP, NOT A PERSON.** A patient this specialist treats
   * in both modules arrives twice, once per module, each row with its own
   * `acceptedAt` and its own figures — because that is what the two are: two
   * relationships, each with its own moment of consent and its own reports. See
   * `specjalist_patient` and migration 0022.
   */
  module: AppModule
  /** The module in words, from the backend, so the panel and the invitation
   *  card cannot disagree about what to call it. */
  moduleLabel: string
  /**
   * How much they have been writing **in this module** — null on a pending
   * invitation.
   *
   * Engagement only, never content: the content is the weekly reports, which are
   * a document you open deliberately rather than a figure in a list. See
   * PATIENT_SUMMARY_FIELDS in core/specialist.py. Which diary the figures come
   * from follows the relationship: a psychodietitian reading an entry count
   * from a diary they cannot open would be told something they cannot act on.
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
    // Defaulted for a backend that predates the column: everything that existed
    // before it was a psychotherapy relationship, which is exactly what
    // migration 0022's backfill says.
    module: payload.module ?? MODULE_PSYCHOTHERAPY,
    moduleLabel: payload.module_label ?? moduleLabel(payload.module ?? MODULE_PSYCHOTHERAPY),
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
export async function invitePatient(
  patientEmail: string,
  module: AppModule,
): Promise<SpecialistCaseload> {
  return toCaseload(
    await apiRequest<PatientListPayload>('/api/specialist/patients/', {
      method: 'POST',
      body: { patient_email: patientEmail, module },
    }),
  )
}

/**
 * Ends the relationship, or withdraws an unanswered request.
 *
 * The specialist is the only side that can do this to an accepted link — the
 * client's rule, for a clinical reason: see pages/Reports.tsx.
 */
export async function dropPatient(
  patientId: string,
  module: AppModule,
): Promise<SpecialistCaseload> {
  return toCaseload(
    await apiRequest<PatientListPayload>(
      `/api/specialist/patients/${encodeURIComponent(patientId)}/${module}/`,
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

/**
 * The same three, for the **diet** module.
 *
 * Their own paths rather than a module parameter on the three above, mirroring
 * the split the patient's own routes already have: the two modules do not agree
 * on what a week is (Monday-to-Sunday there, seven days from the first entry
 * here), so one endpoint holding both would be one endpoint with two meanings
 * of the word.
 *
 * 404 for a specialist whose relationship with this patient is a psychotherapy
 * one — the food diary is not theirs to read, and being somebody's therapist is
 * not a key to every module.
 */
export async function fetchPatientDietReports(
  patientId: string,
): Promise<DietWeeklyReport[]> {
  const payload = await apiRequest<DietReportPayload[]>(
    `/api/specialist/patients/${encodeURIComponent(patientId)}/diet-reports/`,
  )
  return payload.map(toDietReport)
}

export async function fetchPatientDietReport(
  patientId: string,
  reportId: string,
): Promise<DietWeeklyReport> {
  return toDietReport(
    await apiRequest<DietReportPayload>(
      `/api/specialist/patients/${encodeURIComponent(patientId)}/diet-reports/${encodeURIComponent(reportId)}/`,
    ),
  )
}

export async function fetchPatientDietReportPdf(
  patientId: string,
  reportId: string,
): Promise<Blob> {
  return apiDownload(
    `/api/specialist/patients/${encodeURIComponent(patientId)}/diet-reports/${encodeURIComponent(reportId)}/pdf/`,
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
  id: string
  specialist: string | null
  email: string | null
  approach: string | null
  module: AppModule
  module_label: string
}

export interface SpecialistInvitation {
  /** The invitation's own id — what the accept/reject URLs carry. */
  id: string
  /** The specialist's name, or their address when the row carries no name. */
  specialist: string | null
  email: string | null
  /** `specjalist.specjalization` — what they entered at registration. */
  approach: string | null
  /**
   * Which module is being asked about.
   *
   * Agreeing to a psychodietitian is not agreeing to hand over a psychotherapy
   * diary: the relationship, and the reports it opens, belong to one module.
   * The card says so before the tap, because a consent that does not name what
   * it covers is not informed.
   */
  module: AppModule
  moduleLabel: string
}

function toInvitation(payload: SpecialistInvitationPayload): SpecialistInvitation {
  return {
    id: payload.id,
    specialist: payload.specialist,
    email: payload.email,
    approach: payload.approach,
    module: payload.module,
    moduleLabel: payload.module_label || moduleLabel(payload.module),
  }
}

async function invitationRequest(
  path: string,
  method?: 'POST',
): Promise<SpecialistInvitation[]> {
  const payload = await apiRequest<{ invitations: SpecialistInvitationPayload[] }>(
    path,
    method ? { method } : undefined,
  )
  return (payload.invitations ?? []).map(toInvitation)
}

/**
 * Every invitation waiting for the signed-in patient. Empty is the ordinary
 * answer.
 *
 * **A LIST RATHER THAN ONE ROW**, since the relationship gained a module: a
 * patient can be asked by a psychotherapist and a psychodietitian in the same
 * week, and a screen that could only draw one would leave the other specialist
 * waiting on an answer their patient was never offered.
 */
export function fetchSpecialistInvitations(): Promise<SpecialistInvitation[]> {
  return invitationRequest('/api/account/specialist-invitation/')
}

/**
 * The patient agrees to be treated by that specialist, in that invitation's
 * module.
 *
 * From here on the specialist can read this patient's reports **from that
 * module**, and the patient cannot undo it — dropping the link is the
 * specialist's action (the client's rule; see pages/Reports.tsx). The screen
 * says so before the tap. It also replaces whoever was treating them in that
 * module, and nothing in the other one.
 *
 * Answers with what is still waiting, so a patient holding two invitations sees
 * the second one where the first was.
 */
export function acceptSpecialistInvitation(id: string): Promise<SpecialistInvitation[]> {
  return invitationRequest(
    `/api/account/specialist-invitation/${encodeURIComponent(id)}/accept/`, 'POST',
  )
}

export function rejectSpecialistInvitation(id: string): Promise<SpecialistInvitation[]> {
  return invitationRequest(
    `/api/account/specialist-invitation/${encodeURIComponent(id)}/reject/`, 'POST',
  )
}

/** As `core.colleagues.serialize_colleague` returns it — never a password. */
interface ColleaguePayload {
  id: string
  name: string | null
  surname: string | null
  email: string | null
  specialization: string | null
  module?: string | null
  module_label?: string | null
  created_at: string | null
  consents_active: boolean
}

export interface Colleague {
  /** The specialist's `user` id. */
  id: string
  name: string | null
  surname: string | null
  email: string | null
  /** `specjalist.specjalization` — what the patient reads next to their name. */
  specialization: string | null
  /** Which module the account works in, named in words; null on an older backend. */
  moduleLabel: string | null
  createdAt: string | null
  /**
   * Whether this account's own RODO consents are in force.
   *
   * False on an account nobody has logged into yet: creating it grants no
   * consent, because consent is the act of the person it belongs to (see
   * core/colleagues.py). It travels so the roster can say "waiting for its
   * owner to finish" rather than showing a row that looks broken.
   */
  consentsActive: boolean
}

function toColleague(payload: ColleaguePayload): Colleague {
  return {
    id: payload.id,
    name: payload.name,
    surname: payload.surname,
    email: payload.email,
    specialization: payload.specialization,
    moduleLabel: payload.module_label ?? null,
    createdAt: payload.created_at,
    consentsActive: payload.consents_active,
  }
}

/**
 * Every specialist account.
 *
 * Professional identity and nothing else — no caseload and no counters: a
 * colleague's patients agreed to *them*. See COLLEAGUE_SUMMARY_FIELDS in
 * core/colleagues.py.
 */
export async function fetchColleagues(): Promise<Colleague[]> {
  const payload = await apiRequest<ColleaguePayload[]>('/api/specialist/colleagues/')
  return payload.map(toColleague)
}

export interface NewColleague {
  email: string
  firstName: string
  lastName: string
  dateOfBirth: string
  specialization: string
  /** Which panel the new account lands on; required, with no default. */
  module: AppModule
}

export interface CreatedColleague {
  /**
   * The temporary password, in plaintext, **for this response only**.
   *
   * Stored as a hash like every other, so nothing can read it back — not this
   * API, not the roster, not the database. The screen has to show it while it
   * has it and say so. An account whose temporary password is lost is not lost
   * with it: it can ask for a reset link from /login, which is mailed to its own
   * address (see api/auth.ts `requestPasswordReset`).
   */
  password: string
  specialist: Colleague
}

/**
 * Creates another specialist's account. This is where a specialist account
 * comes from — the registration form cannot make one.
 *
 * The new account has granted no consents, so its owner meets the consent
 * screen at first login and grants them there. That is not a step to work
 * around: consent is theirs to give.
 */
export async function createColleague(input: NewColleague): Promise<CreatedColleague> {
  const payload = await apiRequest<{ password: string; specialist: ColleaguePayload }>(
    '/api/specialist/colleagues/',
    {
      method: 'POST',
      body: {
        email: input.email,
        name: input.firstName,
        surname: input.lastName,
        date_of_birth: input.dateOfBirth,
        specialization: input.specialization,
        module: input.module,
      },
    },
  )
  return { password: payload.password, specialist: toColleague(payload.specialist) }
}

/** API field name -> form field name, so a 400 lands under the right input. */
export const COLLEAGUE_FIELDS: Record<string, string> = {
  email: 'email',
  name: 'firstName',
  surname: 'lastName',
  date_of_birth: 'dateOfBirth',
  specialization: 'specialization',
  module: 'module',
}
