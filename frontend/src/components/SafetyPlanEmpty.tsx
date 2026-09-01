/**
 * What the screen shows when no specialist has written a plan for this account.
 *
 * THIS IS THE DEFAULT STATE, not an error and not an edge case. A plan exists
 * only once a specialist has sat down and written one, so most accounts will
 * open this screen and see exactly this. It is designed accordingly: it explains
 * what the thing is, says who makes it, and suggests raising it at the next
 * appointment.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a warning, not a nag and not a "you are
 * missing something" — nothing here is red, nothing scolds and nothing implies
 * the patient failed to do a task. It also offers no way to write a plan alone:
 * the whole point of the feature is that it is prepared with a therapist, and an
 * "utwórz plan" button here would quietly hand the authorship of a clinical
 * document to the person it is about.
 *
 * The support numbers above stay fully visible in this state, which is why the
 * screen is worth opening at all with no plan.
 */
function SafetyPlanEmpty() {
  return (
    <section className="safety-plan-card safety-plan-empty" aria-labelledby="safety-plan-heading">
      <h2 id="safety-plan-heading">Twój plan bezpieczeństwa</h2>
      <p>
        Nie masz jeszcze ułożonego planu — i to zupełnie normalne. Plan bezpieczeństwa to krótka,
        osobista notatka, którą przygotowuje się wspólnie ze specjalistą: co u Ciebie zapowiada
        gorszy czas, co wtedy pomaga i do kogo możesz się odezwać.
      </p>
      <p>
        Jeśli chcesz taki plan mieć, powiedz o tym na najbliższej wizycie. Kiedy specjalista go
        przygotuje, pojawi się w tym miejscu.
      </p>
      <p className="safety-plan-empty-note">
        Numery powyżej działają niezależnie od planu — możesz z nich korzystać zawsze.
      </p>
    </section>
  )
}

export default SafetyPlanEmpty
