import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import TechniqueRow from './TechniqueRow'
import type { Technique, TechniqueSchool } from '../types/technique'

/**
 * One catalogue row.
 *
 * The technique comes in as a prop, so these tests need no catalogue content of
 * their own — which is what lets them cover a technique tagged with two schools,
 * a state the real data does not contain yet.
 */

/** Renders whatever the row navigated to, so the state it passed is readable. */
function StateProbe() {
  const { pathname, state } = useLocation()
  return <p>{`${pathname} ${JSON.stringify(state)}`}</p>
}

function technique(overrides: Partial<Technique> = {}): Technique {
  return {
    id: 'oddech',
    nazwa: 'Miarowe oddychanie',
    podtytul: 'Spowolnienie oddechu.',
    szkola: ['dbt', 'relaksacyjne'],
    dostepnosc: 'ogolna',
    wprowadzenie: 'Wprowadzenie.',
    kroki: [{ opis: 'Krok.' }],
    opisGotowy: true,
    ...overrides,
  }
}

function renderRow(school: TechniqueSchool, entry = technique()) {
  return render(
    <MemoryRouter initialEntries={['/techniques']}>
      <Routes>
        <Route path="/techniques" element={<TechniqueRow technique={entry} school={school} />} />
        <Route path="/techniques/:id" element={<StateProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a technique row', () => {
  it('shows the name and the one-sentence subtitle, and no duration', () => {
    renderRow('dbt')

    expect(screen.getByText('Miarowe oddychanie')).toBeInTheDocument()
    expect(screen.getByText('Spowolnienie oddechu.')).toBeInTheDocument()
    expect(screen.queryByText(/\bmin\b/)).not.toBeInTheDocument()
  })

  it('wears the badge of the tab it is read in', () => {
    renderRow('relaksacyjne')

    expect(screen.getByText('Relaks')).toBeInTheDocument()
    expect(screen.queryByText('DBT')).not.toBeInTheDocument()
  })

  it('links to the technique and hands the tab on, so the detail screen can lead back to it', async () => {
    renderRow('relaksacyjne')

    await userEvent.click(screen.getByRole('link'))

    expect(screen.getByText('/techniques/oddech {"szkola":"relaksacyjne"}')).toBeInTheDocument()
  })
})
