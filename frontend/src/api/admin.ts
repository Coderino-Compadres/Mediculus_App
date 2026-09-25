/**
 * The /api/admin/ endpoints — the administrator's panel (core/admin_panel.py).
 *
 * Two jobs: the final decision on a specialist account a colleague created, and
 * a read-only look at user_db. Everything here is identity and account state;
 * about a patient's records the backend sends counts and last dates only, and
 * that is a property of the endpoints rather than of these types — there is no
 * field here that could carry a diary entry, because none arrives.
 */

import { apiRequest } from './client'

// --- specialists waiting for a decision ------------------------------------

/** The smallest thing that names an account: who, and how to reach them. */
interface PersonPayload {
  id: string
  name: string | null
  surname: string | null
  email: string | null
}

export interface Person {
  id: string
  name: string | null
  surname: string | null
  email: string | null
}

function toPerson(payload: PersonPayload): Person {
  return { id: payload.id, name: payload.name, surname: payload.surname, email: payload.email }
}

/** "Anna Kowalska", or the address when the account has no name. */
export function personLabel(person: Person): string {
  const name = [person.name, person.surname].filter(Boolean).join(' ')
  return name || person.email || 'Konto bez nazwy'
}

interface PendingSpecialistPayload extends PersonPayload {
  specialization: string | null
  module: string
  module_label: string
  created_at: string | null
  created_by: PersonPayload | null
  consents_active: boolean
  password_set: boolean
}

export interface PendingSpecialist extends Person {
  specialization: string | null
  moduleLabel: string
  createdAt: string | null
  /** Who created the account from the colleagues screen; null for older ones. */
  createdBy: Person | null
  /** Whether its owner has already granted the consents at first login. */
  consentsActive: boolean
  /** Whether its owner has already replaced the generated password. */
  passwordSet: boolean
}

function toPendingSpecialist(payload: PendingSpecialistPayload): PendingSpecialist {
  return {
    ...toPerson(payload),
    specialization: payload.specialization,
    moduleLabel: payload.module_label,
    createdAt: payload.created_at,
    createdBy: payload.created_by ? toPerson(payload.created_by) : null,
    consentsActive: payload.consents_active,
    passwordSet: payload.password_set,
  }
}

export async function fetchPendingSpecialists(): Promise<PendingSpecialist[]> {
  const payload = await apiRequest<PendingSpecialistPayload[]>('/api/admin/specialists/pending/')
  return payload.map(toPendingSpecialist)
}

/** Approve one; answers with the list as it stands afterwards. */
export async function approveSpecialist(id: string): Promise<PendingSpecialist[]> {
  const payload = await apiRequest<PendingSpecialistPayload[]>(
    `/api/admin/specialists/${id}/approve/`,
    { method: 'POST' },
  )
  return payload.map(toPendingSpecialist)
}

/** Reject one — which deletes the account. Answers with the list afterwards. */
export async function rejectSpecialist(id: string): Promise<PendingSpecialist[]> {
  const payload = await apiRequest<PendingSpecialistPayload[]>(
    `/api/admin/specialists/${id}/reject/`,
    { method: 'POST' },
  )
  return payload.map(toPendingSpecialist)
}

// --- the overview -----------------------------------------------------------

/** As `core.admin_panel.overview` returns it — counts, naming nobody. The
 *  shape is read as-is: it is numbers under fixed keys, nothing to translate. */
export interface Overview {
  accounts: Record<AccountKind, number> & { total: number }
  patients: { adults: number; minors: number }
  specialists: { approved: number; pending: number; psychotherapy: number; diet: number }
  care_links: { accepted: number; pending: number }
  guardian_links: { accepted: number; pending: number }
  records: {
    diary_entries: number
    meals: number
    hydration_entries: number
    supplements: number
    activities: number
    sleep_nights: number
    health_profiles: number
  }
}

export async function fetchOverview(): Promise<Overview> {
  return apiRequest<Overview>('/api/admin/overview/')
}

// --- accounts ---------------------------------------------------------------

/** Mirrors `KINDS` in core/admin_panel.py. */
export const ACCOUNT_KINDS = ['patient', 'specialist', 'guardian', 'admin', 'other'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  patient: 'Pacjent',
  specialist: 'Specjalista',
  guardian: 'Rodzic lub opiekun',
  admin: 'Administrator',
  other: 'Inne',
}

/** The plural, for a filter chip. */
export const ACCOUNT_KIND_PLURALS: Record<AccountKind, string> = {
  patient: 'Pacjenci',
  specialist: 'Specjaliści',
  guardian: 'Opiekunowie',
  admin: 'Administratorzy',
  other: 'Inne',
}

function toKind(value: string): AccountKind {
  return (ACCOUNT_KINDS as readonly string[]).includes(value) ? (value as AccountKind) : 'other'
}

interface AccountRowPayload extends PersonPayload {
  kind: string
  role: string | null
  created_at: string | null
  consents_active: boolean
  must_change_password: boolean
  specialist_approved: boolean | null
  specialist_module: string | null
  is_child: boolean | null
}

export interface AccountRow extends Person {
  kind: AccountKind
  role: string | null
  createdAt: string | null
  consentsActive: boolean
  mustChangePassword: boolean
  /** null for every account that is not a specialist's. */
  specialistApproved: boolean | null
  /** null for every account that is not a patient's. */
  isChild: boolean | null
}

function toAccountRow(payload: AccountRowPayload): AccountRow {
  return {
    ...toPerson(payload),
    kind: toKind(payload.kind),
    role: payload.role,
    createdAt: payload.created_at,
    consentsActive: payload.consents_active,
    mustChangePassword: payload.must_change_password,
    specialistApproved: payload.specialist_approved,
    isChild: payload.is_child,
  }
}

/** What is worth saying about an account's state, in the order it matters. */
export function accountFlags(row: AccountRow): string[] {
  const flags: string[] = []
  if (row.specialistApproved === false) flags.push('czeka na weryfikację')
  if (row.isChild === true) flags.push('małoletni')
  if (!row.consentsActive) flags.push('bez aktywnych zgód')
  if (row.mustChangePassword) flags.push('hasło tymczasowe')
  return flags
}

/** Every account, newest first, or only one `kind`. Paginated client-side. */
export async function fetchAccounts(kind?: AccountKind): Promise<AccountRow[]> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  const payload = await apiRequest<AccountRowPayload[]>(`/api/admin/accounts/${query}`)
  return payload.map(toAccountRow)
}

interface LinkPayload extends PersonPayload {
  accepted: boolean
  module?: string
  module_label?: string
}

export interface Link extends Person {
  accepted: boolean
  /** The module a care relationship is in; absent on a guardian link. */
  moduleLabel: string | null
}

function toLink(payload: LinkPayload): Link {
  return {
    ...toPerson(payload),
    accepted: payload.accepted,
    moduleLabel: payload.module_label ?? null,
  }
}

/** A count and the date of the latest one ('YYYY-MM-DD'), or null if none. */
export interface Tally {
  count: number
  last: string | null
}

export interface Activity {
  diaryEntries: Tally
  meals: Tally
  hydrationEntries: Tally
  activities: Tally
  sleepNights: Tally
  supplements: number
  healthProfile: boolean
}

interface ActivityPayload {
  diary_entries: Tally
  meals: Tally
  hydration_entries: Tally
  activities: Tally
  sleep_nights: Tally
  supplements: number
  health_profile: boolean
}

interface AccountDetailPayload extends AccountRowPayload {
  date_of_birth: string | null
  updated_at: string | null
  specialist: {
    specialization: string | null
    module: string
    module_label: string
    approved_at: string | null
    created_by: PersonPayload | null
    patients: LinkPayload[]
  } | null
  patient: {
    is_child: boolean | null
    guardian_status: string | null
    guardians: LinkPayload[]
    specialists: LinkPayload[]
    activity: ActivityPayload
  } | null
  guardian: { children: LinkPayload[] } | null
}

export interface AccountDetail extends AccountRow {
  dateOfBirth: string | null
  updatedAt: string | null
  specialist: {
    specialization: string | null
    moduleLabel: string
    approvedAt: string | null
    createdBy: Person | null
    patients: Link[]
  } | null
  patient: {
    isChild: boolean | null
    /** 'none' | 'pending' | 'accepted' for a minor; null for an adult. */
    guardianStatus: string | null
    guardians: Link[]
    specialists: Link[]
    activity: Activity
  } | null
  guardian: { children: Link[] } | null
}

function toAccountDetail(payload: AccountDetailPayload): AccountDetail {
  const { specialist, patient, guardian } = payload
  return {
    ...toAccountRow(payload),
    dateOfBirth: payload.date_of_birth,
    updatedAt: payload.updated_at,
    specialist: specialist
      ? {
          specialization: specialist.specialization,
          moduleLabel: specialist.module_label,
          approvedAt: specialist.approved_at,
          createdBy: specialist.created_by ? toPerson(specialist.created_by) : null,
          patients: specialist.patients.map(toLink),
        }
      : null,
    patient: patient
      ? {
          isChild: patient.is_child,
          guardianStatus: patient.guardian_status,
          guardians: patient.guardians.map(toLink),
          specialists: patient.specialists.map(toLink),
          activity: {
            diaryEntries: patient.activity.diary_entries,
            meals: patient.activity.meals,
            hydrationEntries: patient.activity.hydration_entries,
            activities: patient.activity.activities,
            sleepNights: patient.activity.sleep_nights,
            supplements: patient.activity.supplements,
            healthProfile: patient.activity.health_profile,
          },
        }
      : null,
    guardian: guardian ? { children: guardian.children.map(toLink) } : null,
  }
}

export async function fetchAccount(id: string): Promise<AccountDetail> {
  const payload = await apiRequest<AccountDetailPayload>(`/api/admin/accounts/${id}/`)
  return toAccountDetail(payload)
}

// --- the audit log ----------------------------------------------------------

/** Mirrors `AUDIT_ACTIONS` in core/admin_panel.py; keep the two in step. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  view_overview: 'Przegląd statystyk',
  view_accounts: 'Przegląd listy kont',
  view_account: 'Podgląd konta',
  view_pending_specialists: 'Przegląd kont do weryfikacji',
  approve_specialist: 'Zatwierdzenie konta specjalisty',
  reject_specialist: 'Odrzucenie i usunięcie konta specjalisty',
}

/** An action the backend added after this list was written reads as its own
 *  name rather than disappearing. */
export function auditActionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTION_LABELS, action) ? AUDIT_ACTION_LABELS[action] : action
}

interface AuditEntryPayload {
  id: string
  admin_email: string
  action: string
  target_id: string | null
  target_label: string | null
  created_at: string | null
}

export interface AuditEntry {
  id: string
  adminEmail: string
  action: string
  targetId: string | null
  targetLabel: string | null
  createdAt: string | null
}

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  const payload = await apiRequest<AuditEntryPayload[]>('/api/admin/audit-log/')
  return payload.map((entry) => ({
    id: entry.id,
    adminEmail: entry.admin_email,
    action: entry.action,
    targetId: entry.target_id,
    targetLabel: entry.target_label,
    createdAt: entry.created_at,
  }))
}
