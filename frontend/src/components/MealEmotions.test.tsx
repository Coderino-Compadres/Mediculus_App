import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import MealEmotions from './MealEmotions'
import { EMOTION_COLORS } from '../utils/emotions'

/**
 * The read-only chips under a meal, on the three screens that render one.
 *
 * What matters here is what it refuses to say: an unrated chip carries no
 * number, and a meal with no emotions renders nothing at all rather than a
 * "brak emocji" that would read as a gap in the record.
 */

describe('MealEmotions', () => {
  it('draws one chip per emotion, with its rating', () => {
    render(
      <MealEmotions
        emotions={[
          { emotion: 'Lęk', intensity: 7 },
          { emotion: 'Spokój', intensity: 2 },
        ]}
      />,
    )

    expect(screen.getByText('Lęk')).toBeInTheDocument()
    expect(screen.getByText('7/10')).toBeInTheDocument()
    expect(screen.getByText('Spokój')).toBeInTheDocument()
    expect(screen.getByText('2/10')).toBeInTheDocument()
  })

  it('shows no number for a chip that was never rated', () => {
    /** `null` is not a 0 — printing "0/10" would put a rating on the record
     *  that nobody gave. */
    render(<MealEmotions emotions={[{ emotion: 'Wstyd', intensity: null }]} />)

    expect(screen.getByText('Wstyd')).toBeInTheDocument()
    expect(screen.queryByText('0/10')).not.toBeInTheDocument()
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument()
  })

  it('keeps a rating of 0, which is an answer somebody gave', () => {
    render(<MealEmotions emotions={[{ emotion: 'Złość', intensity: 0 }]} />)

    expect(screen.getByText('0/10')).toBeInTheDocument()
  })

  it('renders nothing at all for a meal without emotions', () => {
    /** §05: a meal saved without naming one is an ordinary meal, not a gap. */
    const { container } = render(<MealEmotions emotions={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('carries the emotion\'s own colour, the same one the charts use', () => {
    render(<MealEmotions emotions={[{ emotion: 'Radość', intensity: 5 }]} />)

    expect(screen.getByText('Radość').closest('li')).toHaveStyle({
      color: EMOTION_COLORS['Radość'],
    })
  })

  it('summarises nothing and judges nothing', () => {
    /** §02/§05: no count, no dominant emotion, no comparison — this draws what
     *  the patient picked at this meal and stops there. */
    render(
      <MealEmotions
        emotions={[
          { emotion: 'Lęk', intensity: 9 },
          { emotion: 'Wstyd', intensity: 8 },
        ]}
      />,
    )

    expect(document.body.textContent)
      .not.toMatch(/wysokie|dominując|najczęst|razem|średni/i)
  })
})
