import PhoneLink from './PhoneLink'
import { CRISIS_LINES } from '../data/crisisLines'
import type { CrisisLine } from '../types/safetyPlan'
import './crisisLines.css'

/**
 * The support numbers, and the one part of "Plan bezpieczeństwa" that works
 * today.
 *
 * ALWAYS RENDERED. It does not depend on the patient having a plan, it is not
 * behind a disclosure and it sits directly under the header so that it is on
 * screen without scrolling. That placement is the client's requirement about
 * design — "elementy krytyczne (np. numer pomocowy/kryzysowy) muszą być
 * wizualnie wyróżnione" — read literally: an account with no plan still opens
 * this screen and still gets something it can act on.
 *
 * WHY IT LOOKS THE WAY IT DOES. A filled sage panel, not the red of
 * `.home-crisis-banner` / `.home-stat-card-alert`. Those two say "something in
 * your data crossed a threshold"; this says "here is where help is, whenever you
 * want it". If both were red the user would read the second as the first and
 * conclude the app had decided something about them — which it has not. The
 * distinction is carried by colour, so the youth lines also carry a text badge
 * and the emergency line its own wording.
 */

/**
 * The badge on a line published for under-18s.
 *
 * Minors use this app — `minor_patient` is an account type at registration — and
 * an adult helpline handed to a 14-year-old as though it were theirs is a wasted
 * call at the worst possible moment. Text, not just a colour.
 */
const YOUTH_BADGE = 'dla młodych'

function CrisisLineRow({ line }: { line: CrisisLine }) {
  return (
    <li className={line.isEmergency ? 'crisis-line crisis-line-emergency' : 'crisis-line'}>
      <PhoneLink phone={line.number} label={line.name} className="crisis-line-number" />
      <div className="crisis-line-text">
        <p className="crisis-line-name">
          {line.name}
          {line.forYouth && <span className="crisis-line-badge">{YOUTH_BADGE}</span>}
        </p>
        <p className="crisis-line-meta">
          {line.audience} · {line.availability}
        </p>
      </div>
    </li>
  )
}

/**
 * `className` is for the one caller that is not the safety-plan screen:
 * LinkGuardian renders this inside the auth card, where the panel needs a gap
 * above it that the page's own flex layout supplies everywhere else.
 */
function CrisisLines({ className }: { className?: string } = {}) {
  return (
    <section
      className={className ? `crisis-lines ${className}` : 'crisis-lines'}
      aria-labelledby="crisis-lines-heading"
    >
      <h2 id="crisis-lines-heading" className="crisis-lines-heading">
        Gdy potrzebujesz rozmowy teraz
      </h2>
      <p className="crisis-lines-lead">
        Te numery są dostępne niezależnie od tego, czy masz ułożony plan. Nie musisz mieć konkretnej
        sprawy ani wiedzieć, od czego zacząć.
      </p>
      {/* A list, so a screen reader announces how many numbers there are before
          reading them out — on this screen that count is useful information. */}
      <ul className="crisis-lines-list">
        {CRISIS_LINES.map((line) => (
          <CrisisLineRow key={line.id} line={line} />
        ))}
      </ul>
    </section>
  )
}

export default CrisisLines
