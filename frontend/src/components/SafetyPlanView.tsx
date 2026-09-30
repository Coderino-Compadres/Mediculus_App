import type { ReactNode } from 'react'
import PhoneLink from './PhoneLink'
import { fromIsoDate } from '../utils/days'
import type { CareDetails } from '../types/profile'
import type { AlternativeContact, SafetyPlan, TrustedPerson } from '../types/safetyPlan'

/**
 * The patient's plan, shown to them.
 *
 * WRITTEN BY THE PATIENT (components/SafetyPlanForm.tsx), shown here read-only;
 * the "Edytuj plan" button that opens the form lives on the page, not in this
 * view. It used to be a document "przygotowany wspólnie z terapeutą" with no
 * write path at all, which is why every account was shown the same example.
 *
 * SECTION ORDER IS THE CLIENT'S. Warning signs come first because that is what
 * she said the feature is for when asked about it directly: "nie chodzi o numery
 * telefonów, ale chodzi mi nawet o sygnały ostrzegawcze […] żeby jednak mu się
 * coś wyświetlało, że już się zaczyna robić ryzyko". Everything else follows in
 * the order the requirements list it.
 *
 * A SECTION WITH NOTHING IN IT IS NOT RENDERED. Filling in two fields out of
 * five is normal — a plan grows over time — and a
 * half-filled plan should look like a short plan, not like a broken screen with
 * three empty headings in it.
 */

interface SafetyPlanViewProps {
  plan: SafetyPlan
  /**
   * The care relationship, from the same source the profile's "OPIEKA" card
   * reads — `GET /api/account/profile/`, via `useAccountProfile`. Passed in
   * rather than fetched here so the page stays the one place that says where
   * this screen's data comes from.
   *
   * Null while it loads, for an account with no `patient` row, and for a patient
   * with nobody assigned yet. All three render the same way: no "Kontakt do
   * terapeuty" section, rather than a heading with a blank under it.
   */
  care: CareDetails | null
  /**
   * Opens the patient's form. The button sits in the card's own header, next to
   * the title and the date it changes, rather than floating under the card.
   */
  onEdit?: () => void
}

function PlanSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="safety-plan-section">
      <h3 className="safety-plan-section-title">{title}</h3>
      {children}
    </section>
  )
}

/** The plain bulleted sections — warning signs and coping strategies. */
function PlanList({ items }: { items: string[] }) {
  return (
    <ul className="safety-plan-list">
      {/* Keyed by position, not by the text. These are free-form lines a
          patient typed, and two identical ones are a thing that happens — a
          line pasted twice during an appointment, or a backend returning a
          repeated row. Keyed by content, React would collide them and render one
          bullet where the plan has two, silently shortening a clinical list. The
          list is static and read-only, so an index key reorders nothing. */}
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

/**
 * One row of "name — number".
 *
 * The number is a link when there is one and plain text when there is not: a
 * plan may name somebody the patient knows how to reach without writing it down,
 * and a `tel:` link with nothing behind it is worse than an absent one.
 */
function ContactRow({ name, detail, phone }: { name: string; detail: string | null; phone: TrustedPerson['phone'] }) {
  return (
    <li className="safety-plan-contact">
      <span className="safety-plan-contact-name">
        {name}
        {detail && <span className="safety-plan-contact-detail">{detail}</span>}
      </span>
      {phone ? (
        <PhoneLink phone={phone} label={name} className="safety-plan-contact-phone" />
      ) : (
        <span className="safety-plan-contact-nophone">bez numeru w planie</span>
      )}
    </li>
  )
}

/**
 * Who the "kontakt do terapeuty lub lekarza" section names.
 *
 * The treating specialist by default, read from the care relationship — the same
 * row the profile screen shows — so the two screens cannot disagree about who is
 * treating this patient or on what number. `alternativeContact` overrides it and
 * exists only for somebody the care relationship cannot express: a GP, a
 * psychiatrist, a clinic outside the foundation. It is an override rather than an
 * addition on purpose; a plan carrying its own copy of the therapist is exactly
 * how the same person ends up on two screens with two different numbers.
 */
function specialistContact(
  care: CareDetails | null,
  alternative: AlternativeContact | null,
): { name: string; detail: string | null; phone: TrustedPerson['phone'] } | null {
  if (alternative) return { name: alternative.name, detail: alternative.role, phone: alternative.phone }
  if (care) return { name: care.specialist, detail: care.approach, phone: care.phone }
  return null
}

function SafetyPlanView({ plan, care, onEdit }: SafetyPlanViewProps) {
  const specialist = specialistContact(care, plan.alternativeContact)

  return (
    // A labelled region, matching SafetyPlanEmpty: the id below is only worth
    // having if something points at it, and it would be backwards for the empty
    // card to be navigable as a region while the one with the content in it is
    // not.
    <section className="safety-plan-card" aria-labelledby="safety-plan-heading">
      <div className="safety-plan-card-header">
        <div className="safety-plan-card-titles">
          <h2 id="safety-plan-heading">Twój plan bezpieczeństwa</h2>
          {plan.updatedAt && (
            <p className="safety-plan-updated">
              Ostatnia aktualizacja:{' '}
              {/* The API sends a full timestamp; a bare 'YYYY-MM-DD' goes through
                  fromIsoDate so it is read as a local calendar day, not as UTC
                  midnight. */}
              {(plan.updatedAt.length === 10 ? fromIsoDate(plan.updatedAt) : new Date(plan.updatedAt)).toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
        {/* Level with the title, where the eye already is when it wants to
            change something — and quiet: a sage tint, not a filled button,
            because editing is the secondary action on a screen for reading. */}
        {onEdit && (
          // "Edytuj" on screen, and only the pencil on a phone-width card
          // (safetyPlan.css), so the title keeps its line; the full name is
          // the aria-label either way.
          <button
            type="button"
            className="safety-plan-edit-chip"
            onClick={onEdit}
            aria-label="Edytuj plan"
          >
            <span className="safety-plan-edit-chip-icon" aria-hidden="true">
              ✎
            </span>
            <span className="safety-plan-edit-chip-label">Edytuj</span>
          </button>
        )}
      </div>

      <p className="safety-plan-lead">
        To Twój plan, zapisany Twoimi słowami. Wracaj do niego, kiedy potrzebujesz, i zmieniaj go,
        kiedy coś się zmieni — warto też omówić go ze specjalistą.
      </p>

      {/* First, and marked out from the rest. Ochre, which is the tone this app
          already uses for "zwróć uwagę" (the entry form's risky-behaviour note,
          the reports' unfavourable direction) — deliberately not the error red,
          which would turn a list the patient wrote about themselves into a
          warning the app is issuing about them. */}
      {plan.warningSigns.length > 0 && (
        <section className="safety-plan-section safety-plan-section-primary">
          <h3 className="safety-plan-section-title">Sygnały ostrzegawcze</h3>
          <p className="safety-plan-section-hint">
            To, co u Ciebie zwykle zapowiada gorszy czas. Jeśli zauważysz kilka z tych rzeczy naraz,
            to dobry moment, żeby odezwać się do specjalisty — nie trzeba czekać na kryzys.
          </p>
          <PlanList items={plan.warningSigns} />
        </section>
      )}

      {plan.copingStrategies.length > 0 && (
        <PlanSection title="Sposoby radzenia sobie">
          <PlanList items={plan.copingStrategies} />
        </PlanSection>
      )}

      {plan.trustedPeople.length > 0 && (
        <PlanSection title="Osoby, do których mogę się zwrócić">
          <ul className="safety-plan-contacts">
            {plan.trustedPeople.map((person) => (
              <ContactRow key={person.id} name={person.name} detail={person.relation} phone={person.phone} />
            ))}
          </ul>
        </PlanSection>
      )}

      {specialist && (
        <PlanSection title="Kontakt do terapeuty lub lekarza">
          <ul className="safety-plan-contacts">
            <ContactRow name={specialist.name} detail={specialist.detail} phone={specialist.phone} />
          </ul>
        </PlanSection>
      )}

      {plan.notes && (
        <PlanSection title="Co jeszcze warto pamiętać">
          {/* pre-wrap: this is free text the patient typed, and the line breaks
              they put in it are part of what they wrote. */}
          <p className="safety-plan-recommendations">{plan.notes}</p>
        </PlanSection>
      )}
    </section>
  )
}

export default SafetyPlanView
