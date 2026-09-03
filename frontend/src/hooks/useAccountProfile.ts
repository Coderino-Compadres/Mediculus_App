import { useEffect, useState } from 'react'
import { fetchAccountProfile } from '../api/profile'
import { hasPatientProfile } from '../api/auth'
import { useAuth } from '../auth/authContext'
import type { AccountProfile } from '../types/profile'

/**
 * `GET /api/account/profile/`, for the two screens that read it.
 *
 * A hook rather than a fetch in each screen because "Profil" and "Plan
 * bezpieczeństwa" both name the treating specialist, and the whole reason the
 * care relationship has one source is that the two must not be able to disagree
 * about who that is (see `CareDetails`). One caller would not need this; two do.
 *
 * IT DOES NOT ASK FOR EVERY ACCOUNT. The endpoint is behind `_require_patient`,
 * so a guardian or a specialist is answered 403 — correctly, since they have no
 * `patient` row and "0 wpisów, brak terapeuty" would be a clinical record of
 * somebody who is not a clinical subject. `hasPatientProfile` mirrors that rule,
 * and an account it says no to never fires the request: `data` stays null and
 * `failed` stays false, so the screens draw nothing rather than an error.
 *
 * A FAILURE IS REPORTED, NOT SWALLOWED. Both screens word it themselves, because
 * what is missing differs — a missing counter is a gap, a missing therapist on
 * the safety plan is a contact somebody may be looking for. What neither may do
 * is render the absence silently: on this screen that reads as "you have written
 * nothing" and "you have no therapist", both of which are claims.
 */
export function useAccountProfile(): {
  data: AccountProfile | null
  loading: boolean
  failed: boolean
  /** Asks again — what the "Spróbuj ponownie" button on both screens calls. */
  retry: () => void
} {
  const { user } = useAuth()
  const applies = user !== null && hasPatientProfile(user)

  const [data, setData] = useState<AccountProfile | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!applies) return

    // Flipped by the cleanup below, so a screen unmounted mid-flight does not
    // set state after the fact.
    let live = true
    fetchAccountProfile()
      .then((answer) => {
        if (!live) return
        setData(answer)
        // Cleared on success as well as set on failure: a hook that keeps a
        // stale `failed` hides the data it has just loaded — which is the shape
        // of the bug `useYearFrequency` on /analysis still has.
        setFailed(false)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
      .finally(() => {
        if (live) setPending(false)
      })

    return () => {
      live = false
    }
  }, [applies, attempt])

  function retry() {
    setPending(true)
    setFailed(false)
    setAttempt((n) => n + 1)
  }

  // Derived rather than stored, so an account that never asks is never
  // "loading" — and nothing has to set that state from inside the effect.
  return { data, loading: applies && pending, failed, retry }
}
