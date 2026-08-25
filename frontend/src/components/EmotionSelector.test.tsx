import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmotionSelector from './EmotionSelector'
import { EMOTION_COLORS, STRES } from '../utils/emotions'
import type { EmotionEntry } from '../types/diaryEntry'

function renderSelector(selected: EmotionEntry[] = [], alertThresholds?: Record<string, number>) {
  const onToggle = vi.fn()
  const onIntensityChange = vi.fn()
  render(
    <EmotionSelector
      selected={selected}
      onToggle={onToggle}
      onIntensityChange={onIntensityChange}
      alertThresholds={alertThresholds}
    />,
  )
  return { onToggle, onIntensityChange }
}

describe('the chips', () => {
  it('offers all ten emotions the app tracks', () => {
    renderSelector()

    for (const emotion of Object.keys(EMOTION_COLORS)) {
      expect(screen.getByRole('button', { name: emotion })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button')).toHaveLength(10)
  })

  it('reports which emotion was clicked', async () => {
    const { onToggle } = renderSelector()

    await userEvent.click(screen.getByRole('button', { name: 'Lęk' }))

    expect(onToggle).toHaveBeenCalledWith('Lęk')
  })

  it('marks a selected chip differently from an unselected one', () => {
    renderSelector([{ emotion: 'Lęk', intensity: 4 }])

    expect(screen.getByRole('button', { name: 'Lęk' })).toHaveClass('emotion-chip-selected')
    expect(screen.getByRole('button', { name: 'Smutek' })).not.toHaveClass('emotion-chip-selected')
  })

  it('reports the same emotion again for a second click, so it can be unpicked', async () => {
    const { onToggle } = renderSelector([{ emotion: 'Lęk', intensity: 4 }])

    await userEvent.click(screen.getByRole('button', { name: 'Lęk' }))

    expect(onToggle).toHaveBeenCalledWith('Lęk')
  })
})

describe('the intensity sliders', () => {
  it('shows one only for emotions that were picked', () => {
    renderSelector([{ emotion: 'Lęk', intensity: 7 }])

    expect(screen.getByLabelText('Natężenie: Lęk')).toBeInTheDocument()
    expect(screen.queryByLabelText('Natężenie: Smutek')).not.toBeInTheDocument()
  })

  it('shows one per picked emotion — the form allows several at once', () => {
    renderSelector([
      { emotion: 'Lęk', intensity: 7 },
      { emotion: 'Wstyd', intensity: 3 },
      { emotion: STRES, intensity: 5 },
    ])

    expect(screen.getAllByRole('slider')).toHaveLength(3)
  })

  it('reads 0-10 and reports a number', () => {
    const { onIntensityChange } = renderSelector([{ emotion: 'Lęk', intensity: 4 }])
    const slider = screen.getByLabelText('Natężenie: Lęk')

    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '10')
    fireEvent.change(slider, { target: { value: '9' } })

    expect(onIntensityChange).toHaveBeenCalledWith('Lęk', 9)
  })

  it('draws a null intensity as 0 rather than crashing', () => {
    renderSelector([{ emotion: 'Wstyd', intensity: null }])

    expect(screen.getByLabelText('Natężenie: Wstyd')).toHaveValue('0')
    expect(screen.getByText('0/10')).toBeInTheDocument()
  })
})

describe('the stress alert', () => {
  it('highlights stress at or above the threshold', () => {
    // US-PT-13's alarm moved here when the separate stress slider was dropped;
    // stress is one of the ten emotions and is rated like the rest.
    renderSelector([{ emotion: STRES, intensity: 6 }], { [STRES]: 6 })

    expect(screen.getByText('6/10')).toHaveClass('emotion-intensity-value-alert')
  })

  it('leaves stress alone below the threshold', () => {
    renderSelector([{ emotion: STRES, intensity: 5 }], { [STRES]: 6 })

    expect(screen.getByText('5/10')).not.toHaveClass('emotion-intensity-value-alert')
  })

  it('does not highlight another emotion at the same rating', () => {
    renderSelector(
      [{ emotion: STRES, intensity: 8 }, { emotion: 'Radość', intensity: 8 }],
      { [STRES]: 6 },
    )

    const readings = screen.getAllByText('8/10')
    const highlighted = readings.filter((r) => r.className.includes('alert'))
    expect(highlighted).toHaveLength(1)
  })

  it('highlights nothing when no thresholds are passed at all', () => {
    renderSelector([{ emotion: STRES, intensity: 10 }])

    expect(screen.getByText('10/10')).not.toHaveClass('emotion-intensity-value-alert')
  })
})
