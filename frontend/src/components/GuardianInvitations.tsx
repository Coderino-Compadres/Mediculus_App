import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { fetchCurrentUser } from '../api/auth'
import { useAuth } from '../auth/authContext'
import {
  acceptGuardianInvitation,
  fetchGuardianInvitations,
  rejectGuardianInvitation,
  type GuardianInvitation,
} from '../api/guardian'
import '../styles/panel.css'
import './guardianInvitations.css'

/**
 * The guardian's decision, on the first screen they see after logging in.
 *
 * A minor cannot validly consent to processing their own health data (RODO
 * art. 8), so their account stays blocked until this card is answered. That is
 * why it sits under the greeting rather than behind a menu: the child is waiting
 * on it, and a guardian who never finds it leaves them stuck.
 *
 * An answered invitation leaves the list immediately. Nothing here shows a
 * refusal afterwards — refusing deletes the request, which puts the child back
 * to naming someone else rather than leaving them with a "no" they cannot act on.
 */
function GuardianInvitations() {
  const { setUser } = useAuth()
  const [invitations, setInvitations] = useState<GuardianInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [answered, setAnswered] = useState<string | null>(null)
  // Separate from `failed`: a decision that did not go through is not a list
  // that did not load, and saying the latter sends the guardian to refresh a
  // page whose content is already correct.
  const [answerError, setAnswerError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetchGuardianInvitations()
      .then((result) => {
        if (active) setInvitations(result)
      })
      .catch(() => {
        // A failed load must not look like "nobody asked" — a child could be
        // waiting on the other side of it.
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function answer(invitation: GuardianInvitation, decision: 'accept' | 'reject') {
    setBusyId(invitation.id)
    setAnswerError(null)
    try {
      if (decision === 'accept') await acceptGuardianInvitation(invitation.id)
      else await rejectGuardianInvitation(invitation.id)

      drop(invitation)
      setAnswered(
        decision === 'accept'
          ? `Konto ${childLabel(invitation)} zostało powiązane z Twoim.`
          : `Prośba od ${childLabel(invitation)} została odrzucona.`,
      )
      // The header's badge is drawn from the session's own count, which this
      // answer has just made stale — so re-read it.
      void refreshSession()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // Gone between the load and the click: the child withdrew it, or it was
        // answered in another tab. There is no decision left to make, so the
        // card goes away with the explanation rather than staying clickable.
        drop(invitation)
        setAnswerError(
          `Prośba od ${childLabel(invitation)} nie czeka już na odpowiedź — mogła zostać wycofana.`,
        )
      } else {
        setAnswerError('Nie udało się zapisać odpowiedzi. Spróbuj ponownie.')
      }
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Re-reads the session so the header stops saying a child is waiting.
   *
   * `pendingGuardianInvitations` rides on /api/auth/me/ — one payload for one
   * row, see `UserSerializer` — so answering a request here has to refresh it or
   * the dot would sit in the header until the next full reload.
   *
   * Failure is deliberately swallowed: the decision itself went through, and a
   * badge that lingers points at this card, which is already correct. Reporting
   * "nie udało się" about a request that succeeded is the worse of the two
   * errors. A null answer is left alone as well — the session having ended is
   * `AuthProvider`'s call, not this card's.
   */
  async function refreshSession() {
    try {
      const refreshed = await fetchCurrentUser()
      if (refreshed) setUser(refreshed)
    } catch {
      // Nothing to say: see above.
    }
  }

  function drop(invitation: GuardianInvitation) {
    setInvitations((current) => current.filter((item) => item.id !== invitation.id))
  }

  if (loading) return null

  return (
    <div className="invitations">
      {failed && (
        <p className="invitations-error" role="alert">
          Nie udało się wczytać prośb o powiązanie konta. Odśwież stronę.
        </p>
      )}

      {answerError && (
        <p className="invitations-error" role="alert">
          {answerError}
        </p>
      )}

      {answered && (
        <p className="invitations-answered" role="status">
          {answered}
        </p>
      )}

      {invitations.map((invitation) => (
        <div className="panel-card" key={invitation.id}>
          <p className="invitations-lead">
            <strong>{childLabel(invitation)}</strong> prosi o powiązanie swojego konta
            z Twoim jako konto rodzica lub opiekuna.
          </p>
          {invitation.childEmail && (
            <p className="invitations-email">{invitation.childEmail}</p>
          )}
          <p className="invitations-note">
            Do momentu akceptacji konto dziecka jest nieaktywne. Akceptacja jest zgodą na
            przetwarzanie jego danych — nie akceptuj prośby, której nie rozpoznajesz.
          </p>
          <div className="invitations-actions">
            <button
              type="button"
              className="panel-button"
              onClick={() => void answer(invitation, 'accept')}
              disabled={busyId !== null}
            >
              {busyId === invitation.id ? 'Zapisywanie…' : 'Zaakceptuj'}
            </button>
            <button
              type="button"
              className="panel-button-secondary"
              onClick={() => void answer(invitation, 'reject')}
              disabled={busyId !== null}
            >
              Odrzuć
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Whatever the child's account can be recognised by; the e-mail is shown separately. */
function childLabel(invitation: GuardianInvitation): string {
  const name = [invitation.childName, invitation.childSurname].filter(Boolean).join(' ')
  return name || invitation.childEmail || 'Konto dziecka'
}

export default GuardianInvitations
