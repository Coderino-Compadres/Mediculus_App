import HeaderMenu from '../components/HeaderMenu'
import CrisisLines from '../components/CrisisLines'
import SafetyPlanEmpty from '../components/SafetyPlanEmpty'
import SafetyPlanView from '../components/SafetyPlanView'
import { PROFILE_CARE } from '../data/profile'
import { SAFETY_PLAN } from '../data/safetyPlan'
import { APP_DISCLAIMER } from '../utils/disclaimer'
// journals.css is the page frame (.journals-page / .journals-header), reused
// rather than redrawn. home.css is here for two things this screen shares with
// /home and must not redraw: .home-disclaimer (the ochre note, which has to be
// identical on both screens) and the .home-menu-* rules HeaderMenu's markup
// needs — both arrive today only because App.tsx pulls Home in eagerly, so they
// are imported explicitly rather than left to that accident. safetyPlan.css adds
// everything else, the card shell included.
import './journals.css'
import './home.css'
import './safetyPlan.css'

/**
 * "Plan bezpieczeństwa" — the support numbers, and the plan a specialist wrote.
 *
 * NOT IN THE MOCKUP. The mockup covers login, module select, home, the entry
 * form, the diary archive, reports, analysis, techniques and the profile; this
 * screen is in none of them. Everything below is built from the client's
 * requirements plus what already exists in the code, which is why it borrows the
 * archive's page frame instead of inventing a layout.
 *
 * THE PATIENT DOES NOT WRITE THIS SCREEN. The plan is prepared with a therapist
 * — the specialist panel lists "przygotowywać indywidualny plan bezpieczeństwa"
 * as its own job — so here it is read-only, in both states. No form, no save, no
 * API call.
 *
 * WHAT ORDER THE SCREEN IS IN, AND WHY:
 *   1. the support numbers, always, before anything conditional. They are the one
 *      part that works today and the one part that is true for every account,
 *      including the majority who have no plan.
 *   2. the plan, or the explanation of what a plan is.
 *   3. the same disclaimer the home screen carries, from one shared constant.
 *
 * THE DATA IS HARDCODED, IN TWO FILES OF ITS OWN. `data/crisisLines.ts` is
 * permanent (public numbers, no endpoint wanted — see the note there);
 * `data/safetyPlan.ts` is a stand-in, and its header says how to flip it to the
 * empty state for a review with the client. Neither belongs in this file: when a
 * backend arrives, this screen should change by swapping an import for a fetch.
 *
 * TODO(ostrzeganie na podstawie zachowań ryzykownych): asked what this feature is
 * for, the client answered that it is not the phone numbers — it is that a
 * patient accumulating risky situations should be told, before a crisis, that
 * things are heading that way and that it is worth contacting their therapist
 * now. That detection is NOT on this screen and should not move here: it watches
 * diary data, so it belongs next to the logic that already reads it — the home
 * screen's banner at average stress >= 6 (US-PT-13, pages/Home.tsx) is the first
 * piece of it. This screen is where somebody lands once that fires. Recorded here
 * because it is the main value the client attached to the feature, and the code
 * that will carry it is somewhere else entirely.
 *
 * TODO(udostępnianie planu specjaliście): the requirements say the plan matters
 * "jeżeli użytkownik udostępni tę funkcję", and what that sharing covers was
 * never pinned down — who sees the plan, whether the patient can stop it, and how
 * it interacts with the rule that reports are visible to the treating specialist
 * and the patient cannot cut that off (see pages/Reports.tsx). Nothing here
 * shares anything; guessing at the scope of a consent is not something to do in
 * markup.
 */
function SafetyPlan() {
  return (
    <div className="journals-page safety-plan-page">
      <header className="journals-header">
        <div>
          <p className="journals-module-label">PSYCHOTERAPIA</p>
          <h1>Plan bezpieczeństwa</h1>
        </div>
        <HeaderMenu />
      </header>

      {/* First on the page and outside the conditional below, so it is on screen
          without scrolling whether or not a plan exists. */}
      <CrisisLines />

      {SAFETY_PLAN ? <SafetyPlanView plan={SAFETY_PLAN} care={PROFILE_CARE} /> : <SafetyPlanEmpty />}

      {/* Word for word what /home says, from one constant — see utils/disclaimer.ts.
          Two screens describing the app's limits in two slightly different ways is
          the failure this guards against, and this is the screen where being
          precise about it matters most. */}
      <section className="home-disclaimer">
        <span className="home-disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <p>{APP_DISCLAIMER}</p>
      </section>
    </div>
  )
}

export default SafetyPlan
