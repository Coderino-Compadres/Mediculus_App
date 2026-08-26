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
