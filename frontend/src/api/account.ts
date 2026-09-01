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
 * Every function here is a **stub that performs no request and always rejects**.
 * That is deliberate, and it is the honest shape for this state of the project:
 *
 * - the client gets to see and click the complete feature, which is what the
 *   "Bezpieczeństwo" requirements ask for;
 * - whoever implements the backend gets a named contract to fill in — the
 *   signatures below are the request bodies, and the doc comments say which
 *   endpoint each one is waiting for;
 * - and the user is never told their consent was withdrawn or their account
 *   deleted when nothing of the sort happened. A false success on *these three*
 *   actions is not a cosmetic lie: somebody could stop using the app believing
 *   their health data is gone.
 *
 * So each one rejects with a `PendingBackendError`, and the screens render its
 * message as a plain notice rather than as an error — nothing failed, the half
 * that does the work simply does not exist yet.
 *
 * When these become real, they belong behind `apiRequest` from ./client like
 * every other call (session cookie + CSRF header), and the screens should need
 * no change beyond deleting the notice branch.
 */

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
 * TODO(backend): `POST /api/account/consents/withdraw/` with `{ scope }`.
 * Withdrawing is not a flag flip — the timestamp columns record that consent was
 * given, so a withdrawal needs its own recorded moment (art. 7(1) again: the
 * burden of proof is ours in both directions). Note that `scope: 'data'` and
 * `scope: 'all'` end the account, so they land in the same place as
 * `deleteAccount` and must not be able to disagree with it about what is removed.
 */
export function withdrawConsent(scope: ConsentWithdrawalScope): Promise<void> {
  return Promise.reject(
    new PendingBackendError(`POST /api/account/consents/withdraw/ (scope: ${scope})`),
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
