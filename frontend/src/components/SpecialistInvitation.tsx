import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import {
  acceptSpecialistInvitation,
  fetchSpecialistInvitation,
  rejectSpecialistInvitation,
  type SpecialistInvitation as Invitation,
} from '../api/specialist'
import './specialistInvitation.css'

/**
 * "Zaproszenie od specjalisty" — the patient's decision, on their home screen.
 *
 * A specialist naming a patient's address creates a request and nothing else:
 * until this card is answered the specialist sees no reports, no figures, no
 * name. It sits on /home rather than behind a menu because the specialist is
 * waiting on the other side of it, exactly like the guardian's invitation card
 * on /parent.
 *
 * THE CARD SAYS WHAT ACCEPTING MEANS, INCLUDING THE PART THE PATIENT CANNOT
 * UNDO. From then on that specialist reads this patient's weekly reports, and
 * only the specialist can end the link — the client's rule, for a clinical
 * reason: with eating disorders the tendency to hide information rises, so a
 * patient-side switch would disable the feature exactly in the cases it exists
 * for (see the TODO in pages/Reports.tsx). A screen that let somebody agree to
 * that without saying it would be collecting a consent that is not informed.
 *
 * It also says what the specialist does *not* get, because that is the half a
 * patient will assume wrongly: the reports, not the diary entries.
 *
 * A REFUSAL IS NOT RECORDED. The row is cleared, which puts the specialist back
 * to being able to ask again after talking to them — a stored "no" would be a
 * state neither side can act on.
 */

const LOAD_ERROR = 'Nie udało się sprawdzić zaproszeń od specjalisty.'
const ANSWER_ERROR = 'Nie udało się zapisać odpowiedzi. Spróbuj ponownie.'

function SpecialistInvitationCard() {
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [answered, setAnswered] = useState<string | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    fetchSpecialistInvitation()
      .then((answer) => {
        if (live) setInvitation(answer)
      })
      .catch(() => {
        // A failed check must not look like "nobody asked": a specialist could
        // be waiting, and the patient would never know to look again.
        if (live) setFailed(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [])

  async function answer(decision: 'accept' | 'reject') {
    const asking = invitation
    if (!asking) return
    setBusy(true)
    setAnswerError(null)
    try {
      if (decision === 'accept') await acceptSpecialistInvitation()
      else await rejectSpecialistInvitation()
      setInvitation(null)
      setAnswered(
        decision === 'accept'
          ? `${asking.specialist ?? 'Specjalista'} może teraz czytać Twoje raporty tygodniowe.`
          : 'Zaproszenie zostało odrzucone. Nikt nie zobaczył Twoich danych.',
      )
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 404) {
        // Gone between the load and the tap — withdrawn by the specialist, or
        // answered in another tab. There is no decision left, so the card goes
        // away with the explanation instead of staying clickable.
        setInvitation(null)
        setAnswerError('To zaproszenie nie czeka już na odpowiedź — mogło zostać wycofane.')
      } else {
        setAnswerError(ANSWER_ERROR)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  if (failed) {
    return (
      <section className="specialist-invitation">
        <p className="specialist-invitation-error" role="alert">
          {LOAD_ERROR}
        </p>
      </section>
    )
  }

  if (answered) {
    return (
      <section className="specialist-invitation">
        <p className="specialist-invitation-answered" role="status">
          {answered}
        </p>
      </section>
    )
  }

  if (!invitation) {
    // The ordinary state for almost every patient almost always. Nothing is
    // drawn — not an empty card, which would be a permanent reminder of a thing
    // that has not happened.
    return answerError ? (
      <section className="specialist-invitation">
        <p className="specialist-invitation-error" role="alert">
          {answerError}
        </p>
      </section>
    ) : null
  }

  return (
    <section className="specialist-invitation" aria-labelledby="specialist-invitation-heading">
      <h2 id="specialist-invitation-heading">Zaproszenie od specjalisty</h2>
      <p className="specialist-invitation-name">{invitation.specialist}</p>
      {invitation.approach && (
        <p className="specialist-invitation-meta">{invitation.approach}</p>
      )}
      {invitation.email && (
        <p className="specialist-invitation-meta">{invitation.email}</p>
      )}

      <p className="specialist-invitation-text">
        Ta osoba prosi o możliwość prowadzenia Twojej terapii w aplikacji. Jeśli
        potwierdzisz, będzie widzieć Twoje raporty tygodniowe — nie zobaczy
        treści Twoich wpisów w dzienniczku.
      </p>
      {/* The part that cannot be taken back, said before the tap and not after
          it. See the header of this file for the client's reasoning. */}
      <p className="specialist-invitation-text specialist-invitation-warning">
        Potwierdzenia nie można później samemu wycofać — opiekę kończy
        specjalista. Jeśli chcesz ją przerwać, powiedz o tym specjaliście.
      </p>

      {answerError && (
        <p className="specialist-invitation-error" role="alert">
          {answerError}
        </p>
      )}

      <div className="specialist-invitation-actions">
        <button
          type="button"
          className="specialist-invitation-accept"
          onClick={() => void answer('accept')}
          disabled={busy}
        >
          Potwierdzam
        </button>
        <button
          type="button"
          className="specialist-invitation-reject"
          onClick={() => void answer('reject')}
          disabled={busy}
        >
          Odrzuć
        </button>
      </div>
    </section>
  )
}

export default SpecialistInvitationCard
