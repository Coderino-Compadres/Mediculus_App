/**
 * The guardian's half of the invitation: /api/guardian/invitations/.
 *
 * A minor names a guardian by e-mail; nothing is linked until the account at
 * that address answers here. Accepting is the consent a minor cannot give for
 * themselves (RODO art. 8), which is why this lives behind the guardian's own
 * session rather than behind anything the child can click.
 */

import { apiRequest } from './client'

/** As `core.guardian.serialize_invitation` returns it. */
interface InvitationPayload {
  id: string
  child_name: string | null
  child_surname: string | null
  child_email: string | null
}

export interface GuardianInvitation {
  id: string
  childName: string | null
  childSurname: string | null
  childEmail: string | null
}

function toInvitation(payload: InvitationPayload): GuardianInvitation {
  return {
    id: payload.id,
    childName: payload.child_name,
    childSurname: payload.child_surname,
    childEmail: payload.child_email,
  }
}

/**
 * Invitations waiting for the signed-in account's decision.
 *
 * Empty for anyone nobody named, which is the normal answer rather than an
 * error — the screen this feeds is the one every account lands on after login.
 */
export async function fetchGuardianInvitations(): Promise<GuardianInvitation[]> {
  const payload = await apiRequest<InvitationPayload[]>('/api/guardian/invitations/')
  return payload.map(toInvitation)
}

export async function acceptGuardianInvitation(id: string): Promise<void> {
  await apiRequest<void>(`/api/guardian/invitations/${id}/accept/`, { method: 'POST' })
}

export async function rejectGuardianInvitation(id: string): Promise<void> {
  await apiRequest<void>(`/api/guardian/invitations/${id}/reject/`, { method: 'POST' })
}

/** As `core.account.build_linked_children` returns it. */
interface ChildActivityPayload {
  entry_count: number
  streak_days: number
  /** 'YYYY-MM-DD', or null for a diary with nothing in it yet. */
  last_entry_date: string | null
}

interface LinkedChildPayload {
  id: string
  child_name: string | null
  child_surname: string | null
  child_email: string | null
  linked_at: string | null
  consents_active?: boolean
  activity: ChildActivityPayload | null
}

export interface ChildActivity {
  entryCount: number
  streakDays: number
  lastEntryDate: string | null
}

export interface LinkedChild {
  /** The `parent_child` row — a React key, and nothing to look anything up with. */
  id: string
  childName: string | null
  childSurname: string | null
  childEmail: string | null
  /** When this guardian accepted, as an ISO instant. */
  linkedAt: string | null
  /**
   * Whether the child's own RODO consents are in force.
   *
   * False means the account is locked and the app has stopped deriving anything
   * from its diary, which is why `activity` is null — the two travel together so
   * the card can say which of the two reasons it is. Defaults to true for a
   * backend that predates the field, where a null activity meant the older
   * reason (no patient row at all).
   */
  consentsActive: boolean
  /** null when the account has no patient row, or when its consents are withdrawn. */
  activity: ChildActivity | null
}

function toChild(payload: LinkedChildPayload): LinkedChild {
  return {
    id: payload.id,
    childName: payload.child_name,
    childSurname: payload.child_surname,
    childEmail: payload.child_email,
    linkedAt: payload.linked_at,
    consentsActive: payload.consents_active ?? true,
    activity: payload.activity && {
      entryCount: payload.activity.entry_count,
      streakDays: payload.activity.streak_days,
      lastEntryDate: payload.activity.last_entry_date,
    },
  }
}

/**
 * The children this guardian has vouched for, with a summary of each account.
 *
 * ENGAGEMENT, NEVER CONTENT — the payload carries how much has been written and
 * when, and nothing about what it says. That is a deliberate line rather than a
 * stage on the way to showing more: a minor who knows a parent reads their diary
 * writes a different diary. See CHILD_SUMMARY_FIELDS in core/account.py.
 *
 * Only accepted links. A guardian who was named but has not answered gets an
 * empty list — being named is not being their guardian yet.
 */
export async function fetchGuardianChildren(): Promise<LinkedChild[]> {
  const payload = await apiRequest<LinkedChildPayload[]>('/api/guardian/children/')
  return payload.map(toChild)
}
