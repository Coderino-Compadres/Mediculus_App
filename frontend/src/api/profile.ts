/**
 * The profile screen's own data: GET /api/account/profile/.
 *
 * A mapping layer like api/dashboard.ts and api/reports.ts — snake_case columns
 * in, camelCase shapes out, and nothing else. What it does *not* carry is as
 * deliberate as what it does:
 *
 *   - identity (name, e-mail, account type) and the two consent moments arrive
 *     with the session on /api/auth/me/, because they are columns on the same
 *     `user` row. Fetching them again here would be a second answer about one
 *     row, free to disagree with the first;
 *   - the counters and the care relationship are here because they need
 *     medical_db and `patient.specjalist`, which is also why the endpoint is
 *     gated. Only ask for this when `hasPatientProfile(user)` — a guardian has
 *     no `patient` row and is answered 403, on purpose.
 *
 * The two counters are not computed on the server for this screen either: the
 * backend reads them from the same functions behind GET /api/diary/ and
 * GET /api/dashboard/home/, so "8 wpisów" here and the archive's length are the
 * same number by construction rather than by coincidence.
 */

import { apiRequest } from './client'
import type { AccountProfile, CareDetails } from '../types/profile'

/** As `core.account.build_account_profile` returns it. */
interface CarePayload {
  specialist: string
  approach: string | null
  /** Always null today — no table in the schema holds a specialist's number. */
  phone: string | null
}

interface AccountProfilePayload {
  activity: {
    entry_count: number
    streak_days: number
  }
  care: CarePayload | null
}

function toCare(payload: CarePayload | null): CareDetails | null {
  if (!payload) return null
  return {
    specialist: payload.specialist,
    approach: payload.approach,
    // `PhoneNumber` is a branded string in utils/phone.ts and this is the only
    // place a server value could become one. It cannot yet — the column does
    // not exist — so the cast is deliberately not written: null is the honest
    // answer and the safety plan renders "bez numeru w planie" for it.
    phone: null,
  }
}

export async function fetchAccountProfile(): Promise<AccountProfile> {
  const payload = await apiRequest<AccountProfilePayload>('/api/account/profile/')
  return {
    activity: {
      entryCount: payload.activity.entry_count,
      streakDays: payload.activity.streak_days,
    },
    care: toCare(payload.care),
  }
}
