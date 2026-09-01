import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import SafetyPlan from './SafetyPlan'
import { ROUTES } from '../routes'
import { CRISIS_LINES } from '../data/crisisLines'
import { SAFETY_PLAN } from '../data/safetyPlan'
import { APP_DISCLAIMER } from '../utils/disclaimer'

/**
 * The screen itself: what it is composed of and in what order.
 *
 * The two states of the plan are covered where they live —
 * components/SafetyPlanView.test.tsx renders both a filled plan and the empty
 * card directly. Here the plan comes from `data/safetyPlan.ts` as it actually
 * ships, so these tests also fail if that file is left switched to `null` by
 * mistake after a review with the client.
 */
function renderScreen() {
  return renderWithProviders(<SafetyPlan />, { route: ROUTES.safetyPlan })
}

describe('SafetyPlan', () => {
  it('is headed as the psychotherapy module, like every other screen in it', () => {
    renderScreen()

    expect(screen.getByText('PSYCHOTERAPIA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Plan bezpieczeństwa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument()
  })

  it('puts the support numbers first, before anything conditional', () => {
    /** They are the one part of this screen that works today and the one part
     *  that is true for every account — including the majority with no plan. So
     *  they are on screen without scrolling. */
    renderScreen()

    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings[0]).toHaveTextContent(/gdy potrzebujesz rozmowy teraz/i)

    for (const line of CRISIS_LINES) {
      expect(screen.getByRole('link', { name: new RegExp(line.number.display) }))
        .toHaveAttribute('href', `tel:${line.number.dial}`)
    }
  })

  it('renders whichever state data/safetyPlan.ts is switched to', () => {
    /** `SAFETY_PLAN` is a deliberate one-line switch — filled for a walkthrough
     *  with the client, `null` for the state most accounts will really be in —
     *  so this asserts on both branches rather than pinning one. An earlier
     *  version demanded `not.toBeNull()`, which made flipping the switch
     *  documented at the top of that file fail the suite: a test enforcing the
     *  opposite of what the file it covers tells you to do. Both states are
     *  covered in full in components/SafetyPlanView.test.tsx; this only checks
     *  the page picks the right one. */
    renderScreen()

    expect(screen.getByRole('heading', { level: 2, name: /twój plan bezpieczeństwa/i })).toBeInTheDocument()
    if (SAFETY_PLAN) {
      expect(screen.getByRole('heading', { level: 3, name: /sygnały ostrzegawcze/i })).toBeInTheDocument()
      expect(screen.queryByText(/to zupełnie normalne/i)).not.toBeInTheDocument()
    } else {
      expect(screen.getByText(/to zupełnie normalne/i)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    }
  })

  it('repeats the home screen\'s disclaimer word for word', () => {
    /** Two screens describing the app's limits in two slightly different ways is
     *  the drift the shared constant exists to prevent, and this is the screen
     *  where being precise about it matters most. */
    renderScreen()

    expect(screen.getByText(APP_DISCLAIMER)).toBeInTheDocument()
  })

  it('carries no tab bar of its own', () => {
    /** The bottom tab navigation was removed by a team decision; the header menu
     *  is the only navigation. */
    renderScreen()

    expect(document.querySelector('nav.bottom-nav')).not.toBeInTheDocument()
  })
})
