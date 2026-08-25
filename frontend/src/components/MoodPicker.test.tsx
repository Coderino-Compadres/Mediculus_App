import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MoodPicker from './MoodPicker'
import { MOOD_OPTIONS } from '../utils/moods'

describe('MoodPicker', () => {
  it('offers the five levels the backend can store', () => {
    render(<MoodPicker value={null} onChange={() => {}} />)

    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(5)
    expect(options.map((o) => o.textContent)).toEqual([
      'Bardzo źle', 'Źle', 'Neutralnie', 'Dobrze', 'Bardzo dobrze',
    ])
  })

  it('is a radiogroup, so a screen reader announces it as one choice', () => {
    render(<MoodPicker value={null} onChange={() => {}} />)

    expect(screen.getByRole('radiogroup', { name: 'Jak się teraz czujesz?' })).toBeInTheDocument()
  })

  it('marks only the selected tile as checked', () => {
    render(<MoodPicker value="good" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Dobrze' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Źle' })).not.toBeChecked()
  })

  it('reports the wire value, not the label, when a tile is picked', async () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Bardzo dobrze' }))

    expect(onChange).toHaveBeenCalledWith('very_good')
  })

  it('clears the answer when the selected tile is clicked again', async () => {
    // "I would rather not say" has to stay reachable once something is picked.
    const onChange = vi.fn()
    render(<MoodPicker value="good" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Dobrze' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('uses colours from the brand palette rather than inventing new ones', () => {
    // moods.ts borrows from emotions.ts/theme.css; a stray hex here would be a
    // sixth colour nobody approved.
    for (const option of MOOD_OPTIONS) {
      expect(option.color).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})
