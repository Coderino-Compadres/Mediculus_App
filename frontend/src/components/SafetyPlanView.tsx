import type { ReactNode } from 'react'
import PhoneLink from './PhoneLink'
import { fromIsoDate } from '../utils/days'
import type { CareDetails } from '../types/profile'
import type { AlternativeContact, SafetyPlan, TrustedPerson } from '../types/safetyPlan'

/**
 * The plan a specialist wrote, rendered read-only.
 *
 * READ-ONLY IS THE FEATURE, not a stage it will grow out of. The plan is
 * "przygotowany wspólnie z terapeutą" and composing it is an item on the
 * specialist panel; the patient app shows it and nothing else. There is
 * therefore no input, no save and no "edit" affordance anywhere below, and
 * adding one would move a clinical document's authorship without anybody
 * deciding to.
 *
 * SECTION ORDER IS THE CLIENT'S. Warning signs come first because that is what
 * she said the feature is for when asked about it directly: "nie chodzi o numery
 * telefonów, ale chodzi mi nawet o sygnały ostrzegawcze […] żeby jednak mu się
 * coś wyświetlało, że już się zaczyna robić ryzyko". Everything else follows in
 * the order the requirements list it.
 *
 * A SECTION WITH NOTHING IN IT IS NOT RENDERED. A specialist filling in two
 * fields out of five is normal — a plan grows over several appointments — and a
 * half-filled plan should look like a short plan, not like a broken screen with
 * three empty headings in it.
 */

interface SafetyPlanViewProps {
  plan: SafetyPlan
  /**
   * The care relationship, from the same source the profile's "OPIEKA" card
   * reads (`src/data/profile.ts`). Passed in rather than imported here so the
   * page stays the one place that says where this screen's data comes from —
   * which is what makes swapping in a backend an import change.
   */
  care: CareDetails | null
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
          specialist typed, and two identical ones are a thing that happens — a
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

function SafetyPlanView({ plan, care }: SafetyPlanViewProps) {
  const specialist = specialistContact(care, plan.alternativeContact)

  return (
    // A labelled region, matching SafetyPlanEmpty: the id below is only worth
    // having if something points at it, and it would be backwards for the empty
    // card to be navigable as a region while the one with the content in it is
    // not.
    <section className="safety-plan-card" aria-labelledby="safety-plan-heading">
      <div className="safety-plan-card-header">
        <h2 id="safety-plan-heading">Twój plan bezpieczeństwa</h2>
        {plan.updatedAt && (
          <p className="safety-plan-updated">
            Ostatnia aktualizacja:{' '}
            {fromIsoDate(plan.updatedAt).toLocaleDateString('pl-PL', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      <p className="safety-plan-lead">
        Ten plan ułożyłaś lub ułożyłeś razem ze swoim specjalistą. Możesz do niego wracać, kiedy
        potrzebujesz — zmiany wprowadza specjalista podczas wizyty.
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

      {plan.recommendations && (
        <PlanSection title="Indywidualne zalecenia">
          {/* pre-wrap: this is free text a specialist typed, and the line breaks
              they put in it are part of what they wrote. */}
          <p className="safety-plan-recommendations">{plan.recommendations}</p>
        </PlanSection>
      )}
    </section>
  )
}

export default SafetyPlanView
