import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import {
  acceptSpecialistInvitation,
  fetchSpecialistInvitations,
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
 * A REFUSAL IS NOT RECORDED. The row is deleted, which puts the specialist back
 * to being able to ask again after talking to them — a stored "no" would be a
 * state neither side can act on.
 *
 * **ONE CARD PER INVITATION, AND EACH SAYS WHICH MODULE IT IS ABOUT.** A patient
 * can be asked by a psychotherapist and a psychodietitian at the same time —
 * two relationships, two decisions — and a screen that drew one of them would
 * leave the other specialist waiting on an answer nobody was offered. The module
 * is named in the card's text rather than only in a badge, because it is the
 * thing being agreed to: a psychodietitian reads the food diary's reports and
 * not the psychotherapy ones.
 */

const LOAD_ERROR = 'Nie udało się sprawdzić zaproszeń od specjalisty.'
const ANSWER_ERROR = 'Nie udało się zapisać odpowiedzi. Spróbuj ponownie.'

function SpecialistInvitationCard() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [answered, setAnswered] = useState<string | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    fetchSpecialistInvitations()
      .then((answer) => {
        if (live) setInvitations(answer)
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

  async function answer(asking: Invitation, decision: 'accept' | 'reject') {
    setBusyId(asking.id)
    setAnswerError(null)
    try {
      const left =
        decision === 'accept'
          ? await acceptSpecialistInvitation(asking.id)
          : await rejectSpecialistInvitation(asking.id)
      setInvitations(left)
      setAnswered(
        decision === 'accept'
          ? `${asking.specialist ?? 'Specjalista'} może teraz czytać Twoje raporty ` +
            `z modułu ${asking.moduleLabel}.`
          : 'Zaproszenie zostało odrzucone. Nikt nie zobaczył Twoich danych.',
      )
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 404) {
        // Gone between the load and the tap — withdrawn by the specialist, or
        // answered in another tab. There is no decision left, so the card goes
        // away with the explanation instead of staying clickable.
        setInvitations((waiting) => waiting.filter((row) => row.id !== asking.id))
        setAnswerError('To zaproszenie nie czeka już na odpowiedź — mogło zostać wycofane.')
      } else {
        setAnswerError(ANSWER_ERROR)
      }
    } finally {
      setBusyId(null)
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

  // The answer to the last decision stays on the screen above whatever is still
  // waiting: a patient asked by two specialists answers one and has to be able
  // to see that it worked *and* that the other card is a different question.
  const answeredNote = answered ? (
    <p className="specialist-invitation-answered" role="status">
      {answered}
    </p>
  ) : null

  if (invitations.length === 0) {
    if (answeredNote) {
      return <section className="specialist-invitation">{answeredNote}</section>
    }
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
      <h2 id="specialist-invitation-heading">
        {invitations.length === 1
          ? 'Zaproszenie od specjalisty'
          : 'Zaproszenia od specjalistów'}
      </h2>
      {answeredNote}

      {answerError && (
        <p className="specialist-invitation-error" role="alert">
          {answerError}
        </p>
      )}

      {invitations.map((invitation) => (
        <article className="specialist-invitation-card" key={invitation.id}>
          <p className="specialist-invitation-name">{invitation.specialist}</p>
          {/* WHICH MODULE, before anything else about the person: it is what
              the patient is agreeing to, and two invitations differ in nothing
              else on the screen. */}
          <p className="specialist-invitation-module">{invitation.moduleLabel}</p>
          {invitation.approach && (
            <p className="specialist-invitation-meta">{invitation.approach}</p>
          )}
          {invitation.email && (
            <p className="specialist-invitation-meta">{invitation.email}</p>
          )}

          <p className="specialist-invitation-text">
            Ta osoba prosi o możliwość prowadzenia Cię w module{' '}
            {invitation.moduleLabel}. Jeśli potwierdzisz, będzie widzieć Twoje
            raporty tygodniowe z tego modułu — nie zobaczy treści Twoich wpisów
            w dzienniczku ani raportów z drugiego modułu.
          </p>
          {/* The part that cannot be taken back, said before the tap and not
              after it. See the header of this file for the client's reasoning. */}
          <p className="specialist-invitation-text specialist-invitation-warning">
            Potwierdzenia nie można później samemu wycofać — opiekę kończy
            specjalista. Jeśli chcesz ją przerwać, powiedz o tym specjaliście.
          </p>

          <div className="specialist-invitation-actions">
            <button
              type="button"
              className="specialist-invitation-accept"
              onClick={() => void answer(invitation, 'accept')}
              disabled={busyId !== null}
            >
              Potwierdzam
            </button>
            <button
              type="button"
              className="specialist-invitation-reject"
              onClick={() => void answer(invitation, 'reject')}
              disabled={busyId !== null}
            >
              Odrzuć
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}

export default SpecialistInvitationCard
