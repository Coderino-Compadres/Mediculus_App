import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import LevelSlider from './LevelSlider'

function renderSlider(props: Partial<React.ComponentProps<typeof LevelSlider>> = {}) {
  const merged = {
    id: 'energy-level',
    label: 'Poziom energii',
    lowLabel: 'wyczerpanie',
    highLabel: 'pełnia energii',
    value: 5,
    onChange: vi.fn(),
    ...props,
  }
  render(<LevelSlider {...merged} />)
  return merged
}

describe('LevelSlider', () => {
  it('is a 0-10 range tied to its label', () => {
    renderSlider()

    const slider = screen.getByLabelText('Poziom energii')
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '10')
    expect(slider).toHaveAttribute('step', '1')
  })

  it('shows the reading next to the label', () => {
    renderSlider({ value: 7 })

    expect(screen.getByText('7/10')).toBeInTheDocument()
  })

  it('reports the new value as a number, not a string', async () => {
    const { onChange } = renderSlider()

    fireEvent.change(screen.getByLabelText('Poziom energii'), { target: { value: '8' } })

    expect(onChange).toHaveBeenCalledWith(8)
  })

  it('names both ends, so the scale means something without a legend', () => {
    renderSlider()

    expect(screen.getByText('wyczerpanie')).toBeInTheDocument()
    expect(screen.getByText('pełnia energii')).toBeInTheDocument()
  })

  it('leaves the reading unhighlighted when no threshold is given', () => {
    renderSlider({ value: 10 })

    expect(screen.getByText('10/10')).not.toHaveClass('level-slider-value-alert')
  })

  it('highlights the reading at and above the threshold', () => {
    renderSlider({ value: 6, alertThreshold: 6 })

    expect(screen.getByText('6/10')).toHaveClass('level-slider-value-alert')
  })

  it('leaves it alone just below the threshold', () => {
    renderSlider({ value: 5, alertThreshold: 6 })

    expect(screen.getByText('5/10')).not.toHaveClass('level-slider-value-alert')
  })
})
