import { useEffect, useState } from 'react'
import HeaderMenu from '../components/HeaderMenu'
import CrisisLines from '../components/CrisisLines'
import LoadError from '../components/LoadError'
import SafetyPlanEmpty from '../components/SafetyPlanEmpty'
import SafetyPlanForm from '../components/SafetyPlanForm'
import SafetyPlanView from '../components/SafetyPlanView'
import { ApiError } from '../api/client'
import { fetchSafetyPlan } from '../api/safetyPlan'
import { useAccountProfile } from '../hooks/useAccountProfile'
import { APP_DISCLAIMER } from '../utils/disclaimer'
import type { SafetyPlan as Plan } from '../types/safetyPlan'
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
 * "Plan bezpieczeństwa" — the support numbers, and the patient's own plan.
 *
 * THE PATIENT WRITES THE PLAN. It is stored per patient (GET/PUT
 * /api/safety-plan/, core/safety_plan.py) and edited with
 * components/SafetyPlanForm.tsx. It used to be a hardcoded example shown to
 * every account as "Twój plan", with no write path at all.
 *
 * WHAT ORDER THE SCREEN IS IN, AND WHY:
 *   1. the support numbers, always, before anything conditional — including
 *      while the plan loads and when it fails to. They are local, true for
 *      every account, and the one part of this screen that must never wait.
 *   2. the plan, the form, or the invitation to write one.
 *   3. the same disclaimer the home screen carries, from one shared constant.
 *
 * A FAILED LOAD IS NOT AN EMPTY PLAN (CLAUDE.md §4): "Nie masz jeszcze planu"
 * over a plan that exists but did not arrive would invite the person to write
 * it again from scratch in a bad moment. The error says so and offers a retry.
 *
 * The treating specialist comes from `useAccountProfile`, the same request the
 * profile's "OPIEKA" card reads, and is shown as the professional contact when
 * the plan names none of its own.
 */

const LOAD_ERROR = 'Nie udało się wczytać Twojego planu. Numery powyżej działają — spróbuj ponownie za chwilę.'

function SafetyPlan() {
  // Failure is not surfaced here on purpose: this screen's one indispensable
  // half — the crisis lines — is local, and an error box above them would push
  // the numbers down the page to report that a name is missing. A missing
  // therapist already looks like a missing therapist.
  const { data: profile } = useAccountProfile()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchSafetyPlan()
      .then((loaded) => {
        if (cancelled) return
        setPlan(loaded)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError((cause instanceof ApiError && cause.formMessage) || LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  function retry() {
    setLoading(true)
    setAttempt((value) => value + 1)
  }

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

      {loading ? (
        <p className="safety-plan-card" role="status" aria-busy="true">
          Wczytywanie planu…
        </p>
      ) : loadError ? (
        <LoadError className="safety-plan-card" message={loadError} onRetry={retry} />
      ) : editing ? (
        <SafetyPlanForm
          plan={plan}
          onSaved={(saved) => {
            setPlan(saved)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : plan ? (
        <SafetyPlanView
          plan={plan}
          care={profile?.care ?? null}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <SafetyPlanEmpty onCreate={() => setEditing(true)} />
      )}

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
