/**
 * What the screen shows before the patient has written a plan.
 *
 * AN INVITATION, NOT A TASK. Nothing here is red, nothing scolds and nothing
 * implies the patient failed to do something: most accounts start here, and a
 * plan is worth writing only when somebody wants one. It says what the plan is,
 * that it is written in the patient's own words, and that a specialist can help
 * with it — and offers the button that opens the form.
 *
 * The crisis numbers are above this on the page and work with no plan at all;
 * the last line points at them.
 */
function SafetyPlanEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="safety-plan-card safety-plan-empty" aria-labelledby="safety-plan-heading">
      <h2 id="safety-plan-heading">Twój plan bezpieczeństwa</h2>
      <p>
        Nie masz jeszcze swojego planu — i to zupełnie normalne. Plan bezpieczeństwa to krótka,
        osobista notatka na trudniejsze chwile: co u Ciebie zapowiada gorszy czas, co wtedy pomaga
        i do kogo możesz się odezwać.
      </p>
      <p>
        Piszesz go własnymi słowami i możesz go zmieniać w każdej chwili. Jeśli chcesz, ułóż go
        razem ze swoim specjalistą na wizycie.
      </p>
      <button type="button" className="safety-plan-edit-button" onClick={onCreate}>
        Utwórz swój plan
      </button>
      <p className="safety-plan-empty-note">
        Numery powyżej działają niezależnie od planu — możesz z nich korzystać zawsze.
      </p>
    </section>
  )
}

export default SafetyPlanEmpty
