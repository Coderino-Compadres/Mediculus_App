/**
 * The account-level actions the profile screen offers: consent withdrawal,
 * account deletion, and changing the password or the address.
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
 * All of them are real calls now. Deleting the account and changing its
 * address were stubs that performed no request and always rejected, until the
 * backend halves existed (core/account_deletion.py, core/email_change.py) —
 * the reason for the stubs was that a false success on *those* actions is not
 * cosmetic: somebody could stop using the app believing their health data was
 * gone.
 */

import { apiRequest } from './client'
import { toAuthUser, type AuthUser, type UserPayload } from './auth'
import type { ConsentWithdrawalScope } from '../types/profile'

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
}

/** API field name -> form field name, for the confirmation screen's one input. */
export const DELETE_ACCOUNT_FIELDS: Record<string, string> = {
  password: 'password',
}

/**
 * Deletes the signed-in account and everything that is only about it — for
 * good, from both databases. See core/account_deletion.py for what goes.
 *
 * The password is checked on the server (a wrong one answers 400 under
 * `password`); this function only carries it. On success the account's
 * sessions are gone, so the caller signs out locally and leaves.
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  await apiRequest<void>('/api/account/delete/', {
    method: 'POST',
    body: { password: input.password },
  })
}

export interface RequestEmailChangeInput {
  newEmail: string
  currentPassword: string
}

/** API field name -> form field name, so a verdict lands on its own input. */
export const EMAIL_CHANGE_FIELDS: Record<string, string> = {
  new_email: 'newEmail',
  // Not 'currentPassword': the password-change form sits on the same profile
  // and already uses that id.
  current_password: 'emailPassword',
}

/**
 * Asks for a new address. **Nothing changes yet**: a link goes to the new
 * address, and the address changes when that link is confirmed
 * (`confirmEmailChange`). See core/email_change.py for why it takes two halves.
 */
export async function requestEmailChange(input: RequestEmailChangeInput): Promise<void> {
  await apiRequest<void>('/api/account/email/', {
    method: 'POST',
    body: { new_email: input.newEmail.trim(), current_password: input.currentPassword },
  })
}

/**
 * The second half: the token from the link, sent from the page the link opens.
 * Resolves with nothing; every session of the account has ended, so the person
 * signs in again under the new address.
 */
export async function confirmEmailChange(token: string): Promise<void> {
  await apiRequest<void>('/api/auth/email-change/confirm/', {
    method: 'POST',
    body: { token },
  })
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
