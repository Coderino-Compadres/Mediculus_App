import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import SafetyPlanView from './SafetyPlanView'
import SafetyPlanEmpty from './SafetyPlanEmpty'
import { PROFILE_CARE } from '../data/profile'
import type { CareDetails } from '../types/profile'
import type { SafetyPlan } from '../types/safetyPlan'

function plan(overrides: Partial<SafetyPlan> = {}): SafetyPlan {
  return {
    warningSigns: ['Nie śpię dwie noce z rzędu'],
    copingStrategies: ['Wyjść na spacer'],
    trustedPeople: [
      { id: 't1', name: 'Ania', relation: 'siostra', phone: { dial: '000000000', display: '000 000 000' } },
    ],
    alternativeContact: null,
    recommendations: 'Napisz do mnie przed wizytą.',
    updatedAt: '2026-08-11',
    ...overrides,
  }
}

/**
 * A care relationship that does carry a number. The shipped `PROFILE_CARE.phone`
 * is null (there is no phone column behind it yet), so a test about how a number
 * is rendered has to supply one rather than lean on the fixture.
 */
const CARE_WITH_PHONE: CareDetails = {
  specialist: 'mgr Przykładowa',
  approach: 'CBT',
  phone: { dial: '000000000', display: '000 000 000' },
  nextVisit: null,
  lastVisit: null,
}

function renderPlan(data: SafetyPlan, care: CareDetails | null = PROFILE_CARE) {
  return render(<SafetyPlanView plan={data} care={care} />)
}

describe('SafetyPlanView — what the specialist wrote', () => {
  it('puts the warning signs first, ahead of every other section', () => {
    /** The client's stated priority for this whole feature: "nie chodzi o numery
     *  telefonów, ale chodzi mi nawet o sygnały ostrzegawcze […] żeby jednak mu
     *  się coś wyświetlało, że już się zaczyna robić ryzyko". */
    renderPlan(plan())

    const sections = screen.getAllByRole('heading', { level: 3 })
    expect(sections[0]).toHaveTextContent(/sygnały ostrzegawcze/i)
  })

  it('shows every section the plan filled in, in the confirmed order', () => {
    renderPlan(plan())

    const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)
    expect(headings).toEqual([
      'Sygnały ostrzegawcze',
      'Sposoby radzenia sobie',
      'Osoby, do których mogę się zwrócić',
      'Kontakt do terapeuty lub lekarza',
      'Indywidualne zalecenia',
    ])
  })

  it('leaves out a section the specialist has not filled in', () => {
    /** A plan grows over several appointments. Half-filled should look like a
     *  short plan, not like a screen with three empty headings in it. */
    renderPlan(plan({ copingStrategies: [], trustedPeople: [], recommendations: null }))

    expect(screen.getByText('Nie śpię dwie noce z rzędu')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sposoby radzenia sobie/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /osoby, do których/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /indywidualne zalecenia/i })).not.toBeInTheDocument()
  })

  it('is still a plan when only the warning signs are filled in', () => {
    renderPlan(
      plan({ copingStrategies: [], trustedPeople: [], recommendations: null, warningSigns: ['Przestaję odpisywać'] }),
    )

    expect(screen.getByRole('heading', { name: /twój plan bezpieczeństwa/i })).toBeInTheDocument()
    expect(screen.getByText('Przestaję odpisywać')).toBeInTheDocument()
  })

  it('dials a trusted person, and says so plainly when there is no number', () => {
    // CARE_WITH_PHONE so the specialist row is a link too, and this test's
    // "bez numeru" assertion can only be about Kuba.
    renderPlan(
      plan({
        trustedPeople: [
          { id: 't1', name: 'Ania', relation: 'siostra', phone: { dial: '000000000', display: '000 000 000' } },
          { id: 't2', name: 'Kuba', relation: null, phone: null },
        ],
      }),
      CARE_WITH_PHONE,
    )

    expect(screen.getByRole('link', { name: /Ania.*000 000 000/ })).toHaveAttribute('href', 'tel:000000000')
    // A tel: link with nothing behind it is worse than an absent one.
    expect(screen.getByText(/bez numeru w planie/i)).toBeInTheDocument()
    // Ania and the specialist; Kuba is text, not a link.
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('names the treating specialist from the care relationship, not from the plan', () => {
    /** One source, so "Profil" and this screen cannot show the same therapist
     *  under two different names or on two different numbers. */
    renderPlan(plan())

    expect(screen.getByText(new RegExp(PROFILE_CARE.specialist))).toBeInTheDocument()
  })

  it('renders no dead tel: link for the number the app does not have yet', () => {
    /** PROFILE_CARE.phone is null because there is no phone column behind it.
     *  A placeholder here would render a live link that fails when tapped —
     *  which, under "Kontakt do terapeuty lub lekarza", reads to the patient as
     *  their therapist's number being out of service. */
    expect(PROFILE_CARE.phone).toBeNull()

    renderPlan(plan({ trustedPeople: [] }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/bez numeru w planie/i)).toBeInTheDocument()
  })

  it('dials the specialist when the care relationship carries a number', () => {
    renderPlan(plan(), CARE_WITH_PHONE)

    expect(screen.getByRole('link', { name: /mgr Przykładowa.*000 000 000/ }))
      .toHaveAttribute('href', 'tel:000000000')
  })

  it('lets an alternative contact replace the specialist rather than join them', () => {
    /** An override, not an addition — a plan carrying its own copy of the
     *  therapist is exactly how the same person ends up on two screens with two
     *  different numbers. */
    renderPlan(
      plan({
        alternativeContact: {
          name: 'dr Jan Przykładowy',
          role: 'psychiatra',
          phone: { dial: '000000000', display: '000 000 000' },
        },
      }),
    )

    expect(screen.getByText(/dr Jan Przykładowy/)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(PROFILE_CARE.specialist))).not.toBeInTheDocument()
    // Their number has to survive the override too. Without this the whole
    // alternative-contact phone path is unasserted: it could be dropped and
    // every test here would still pass, which is how a plan naming a
    // psychiatrist would quietly render them unreachable.
    expect(screen.getByRole('link', { name: /dr Jan Przykładowy.*000 000 000/ }))
      .toHaveAttribute('href', 'tel:000000000')
  })

  it('says so plainly when the alternative contact has no number either', () => {
    renderPlan(
      plan({
        trustedPeople: [],
        alternativeContact: { name: 'dr Jan Przykładowy', role: 'psychiatra', phone: null },
      }),
    )

    expect(screen.getByText(/dr Jan Przykładowy/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/bez numeru w planie/i)).toBeInTheDocument()
  })

  it('says when the specialist last revised the plan', () => {
    /** A document somebody else wrote about you needs a date on it: without one
     *  a plan from two years ago and one from last week read identically. */
    renderPlan(plan({ updatedAt: '2026-08-11' }))

    expect(screen.getByText(/11 sierpnia 2026/)).toBeInTheDocument()
  })

  it('says nothing about a date it does not have', () => {
    renderPlan(plan({ updatedAt: null }))

    expect(screen.queryByText(/ostatnia aktualizacja/i)).not.toBeInTheDocument()
  })

  it('drops the specialist section entirely when there is nobody to name', () => {
    renderPlan(plan({ alternativeContact: null }), null)

    expect(screen.queryByRole('heading', { name: /kontakt do terapeuty/i })).not.toBeInTheDocument()
  })

  it('offers no way for the patient to write or edit any of it', () => {
    /** Read-only is the feature, not a stage it grows out of: the plan is
     *  prepared with a therapist and composing it belongs to the specialist
     *  panel. */
    renderPlan(plan())

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never asks the patient to list ways of hurting themselves', () => {
    /** A Stanley-Brown plan has a means-restriction step. It belongs in a
     *  consulting room with a clinician present, not in a self-service app used
     *  by minors that says of itself that it is not a crisis tool. */
    renderPlan(plan())

    expect(screen.queryByText(/zabezpiecz|usuń z otoczenia|ukryj przedmioty/i)).not.toBeInTheDocument()
  })

  it('offers nothing that shares the plan with anyone', () => {
    /** The scope of "jeżeli użytkownik udostępni tę funkcję" was never pinned
     *  down — see the TODO on pages/SafetyPlan.tsx. */
    renderPlan(plan())

    expect(screen.queryByText(/udostępnij|wyślij/i)).not.toBeInTheDocument()
  })
})

describe('SafetyPlanEmpty — the state most accounts will be in', () => {
  it('explains what a plan is and who prepares it', () => {
    render(<SafetyPlanEmpty />)

    expect(screen.getByText(/wspólnie ze specjalistą/i)).toBeInTheDocument()
    expect(screen.getByText(/najbliższej wizycie/i)).toBeInTheDocument()
  })

  it('does not read as an error, a warning or a task left undone', () => {
    /** This is the default state, not a failure. */
    render(<SafetyPlanEmpty />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/to zupełnie normalne/i)).toBeInTheDocument()
  })

  it('offers no way to write a plan alone', () => {
    /** An "utwórz plan" button here would quietly hand the authorship of a
     *  clinical document to the person it is about. */
    render(<SafetyPlanEmpty />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('points at the numbers above, which work with no plan at all', () => {
    render(<SafetyPlanEmpty />)

    expect(screen.getByText(/numery powyżej działają niezależnie od planu/i)).toBeInTheDocument()
  })
})
