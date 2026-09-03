/**
 * The account-level actions the profile screen offers: consent withdrawal and
 * account deletion.
 *
 * Data export was here too and was removed from the profile on request. The stub
 * went with it rather than being left unreferenced — but the obligation did not
 * (RODO art. 15 and art. 20), and the notes that were attached to it are worth
 * keeping for whoever brings it back: it is the one endpoint here that spans
 * **both** databases, so the join is `patient.id_medical` in application code
 * rather than a query; it leaves the deployment as a document full of health
 * data, so it needs what GET /api/reports/<week>/pdf/ already has (`Cache-Control:
 * no-store`, an attachment disposition, a throttle); and the format was never
 * settled — PDF is what a person can open, JSON is what art. 20 portability is
 * actually about, and it may well be both.
 *
 * `changePassword` is real. The other two are **stubs that perform no request
 * and always reject**, and that is deliberate rather than unfinished:
 *
 * - the client gets to see and click the complete feature, which is what the
 *   "Bezpieczeństwo" requirements ask for;
 * - whoever implements the backend gets a named contract to fill in — the
 *   signatures below are the request bodies, and the doc comments say which
 *   endpoint each one is waiting for;
 * - and the user is never told their consent was withdrawn or their account
 *   deleted when nothing of the sort happened. A false success on *those two*
 *   actions is not a cosmetic lie: somebody could stop using the app believing
 *   their health data is gone.
 *
 * So each rejects with a `PendingBackendError`, and the screens render its
 * message as a plain notice rather than as an error — nothing failed, the half
 * that does the work simply does not exist yet.
 *
 * Neither is blocked on effort. Consent withdrawal needs the client to settle
 * what withdrawing the services consent *does* (see ServicesConsentWithdrawal)
 * and needs its own recorded moment in the schema, and deletion needs the legal
 * question about retaining clinical records answered first — building either on
 * a guess is worse than shipping the screen without it.
 *
 * Changing the e-mail address has no function here at all, for a third reason:
 * it is not one endpoint but two, since a new address has to be confirmed from
 * a message sent *to it*, and there is no mail out of this deployment. A bare
 * "set the address" would let a typo lock an account out of its own recovery.
 * ProfileEmailForm says "we will confirm it", which stays honest until it can be
 * built.
 */

import { apiRequest } from './client'
import { toAuthUser, type AuthUser, type UserPayload } from './auth'
import type { AccountClosureReason, ConsentWithdrawalScope } from '../types/profile'

export const PENDING_BACKEND_MESSAGE =
  'Ta funkcja zostanie uruchomiona po podłączeniu backendu — na razie nic nie zostało zmienione.'

/**
 * Not an error in the usual sense: the request was never made.
 *
 * Carries the endpoint it is waiting for, so a console line during a demo says
 * what is missing rather than just that something is.
 */
export class PendingBackendError extends Error {
  /** The endpoint this stub stands in for, e.g. 'POST /api/account/export/'. */
  readonly endpoint: string

  constructor(endpoint: string) {
    super(PENDING_BACKEND_MESSAGE)
    this.name = 'PendingBackendError'
    this.endpoint = endpoint
  }
}

/**
 * Withdraws one consent, or both at once.
 *
 * **This locks the account; it does not delete it.** The older reading — that
 * losing the art. 9 consent ends the account, so withdrawal and deletion are the
 * same act — is gone: it made exercising a right (art. 7(3)) indistinguishable
 * from destroying your own record, and irreversible an hour later when you
 * changed your mind. Nothing is removed. The app stops processing, and the only
 * screen that answers is the one offering the consent back.
 *
 * Withdrawal has its own recorded moment rather than clearing the grant — art.
 * 7(1) cuts both ways, and a cleared column would make "never consented" and
 * "consented then withdrew" the same row. See core/consents.py.
 *
 * Answers with the updated user, so the caller can hand it to the session and
 * let the route guard move the app — the same convention as `linkGuardian`.
 */
export async function withdrawConsent(scope: ConsentWithdrawalScope): Promise<AuthUser> {
  return toAuthUser(
    await apiRequest<UserPayload>('/api/account/consents/withdraw/', {
      method: 'POST',
      body: { scope },
    }),
  )
}

/**
 * Grants a withdrawn consent again, from the screen the locked account lands on.
 *
 * No password, deliberately — see `ConsentRestoreView`. This is the direction
 * that unblocks an account, so friction here costs somebody who changed their
 * mind and protects nobody.
 *
 * Answers with the updated user for the same reason `withdrawConsent` does: the
 * route guard reads `consentsActive`, so handing the new one to the session is
 * what moves the app back out of the locked screen.
 */
export async function restoreConsent(scope: ConsentWithdrawalScope): Promise<AuthUser> {
  return toAuthUser(
    await apiRequest<UserPayload>('/api/account/consents/restore/', {
      method: 'POST',
      body: { scope },
    }),
  )
}

export interface DeleteAccountInput {
  /** Re-typed by the user on the confirmation screen, to prove it is them. */
  password: string
  /** Deletion, or the consent withdrawal that leads to the same place. */
  reason: AccountClosureReason
}

/**
 * Ends the account and removes its data.
 *
 * TODO(backend + prawnik): **do not implement this before the scope of deletion
 * is settled.** If the patient's diary entries and the reports shared with the
 * specialist count as medical records, the organization may be legally obliged
 * to keep them — in which case "delete everything" is not a promise this app can
 * make, and the answer is probably pseudonymization of the clinical rows
 * (medical_db already holds nothing but `id_medical`, which is most of the way
 * there) alongside real deletion of the identity rows in user_db. Building a
 * delete that quietly keeps some of it, or one that deletes what has to be kept,
 * are both worse than shipping the screen without the backend. Same open
 * question as the medical-device classification on the project's legal list.
 *
 * The password is re-checked server-side, not just here: this screen only
 * decides what to ask for.
 */
export function deleteAccount(input: DeleteAccountInput): Promise<void> {
  return Promise.reject(
    new PendingBackendError(`DELETE /api/account/ (reason: ${input.reason})`),
  )
}

export interface ChangePasswordInput {
  /** Re-typed even though the session is live: see the note below. */
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

/**
 * API field name -> form field name, so a server verdict lands on the input that
 * produced it — the same job `REGISTER_FIELDS` does for registration.
 */
export const PASSWORD_FIELDS: Record<string, string> = {
  current_password: 'currentPassword',
  new_password: 'newPassword',
  new_password_confirm: 'confirmNewPassword',
}

/**
 * Sets a new password for the signed-in account.
 *
 * The current password goes with it and is checked **server-side**: a live
 * session proves the device, not the person holding it, and the whole value of
 * that field is that taking an account over needs the password too. This
 * function only carries it.
 *
 * The new password is validated again by Django's own validators, which reject
 * things `validatePassword` here does not — a common password of twelve
 * characters, or one that resembles the account's own e-mail. That verdict
 * arrives as a field error and `useAuthForm` places it, via PASSWORD_FIELDS.
 *
 * Resolves with nothing: the endpoint answers 204, because there is no state to
 * hand back and echoing anything about a password is one more place it lives.
 */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiRequest<void>('/api/account/password/', {
    method: 'POST',
    body: {
      current_password: input.currentPassword,
      new_password: input.newPassword,
      new_password_confirm: input.confirmNewPassword,
    },
  })
}
