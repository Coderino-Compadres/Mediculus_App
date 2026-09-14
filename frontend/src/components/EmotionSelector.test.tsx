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

  it('says a null intensity is unrated rather than calling it a 0', () => {
    /** The slider has no empty position, so it sits at 0 — but the reading
     *  beside it must not claim one. The two are different answers, and the
     *  diet module's form can store both: `diet_meal_emotion.intensity` is
     *  nullable, so a chip picked with the slider untouched stays unrated all
     *  the way to the database. */
    renderSelector([{ emotion: 'Wstyd', intensity: null }])

    expect(screen.getByLabelText('Natężenie: Wstyd')).toHaveValue('0')
    expect(screen.getByText('nie podano')).toBeInTheDocument()
    expect(screen.queryByText('0/10')).not.toBeInTheDocument()
  })

  it('moving the slider is what turns an unrated chip into a rated one', () => {
    const { onIntensityChange } = renderSelector([{ emotion: 'Wstyd', intensity: null }])

    fireEvent.change(screen.getByLabelText('Natężenie: Wstyd'), {
      target: { value: '3' },
    })

    expect(onIntensityChange).toHaveBeenCalledWith('Wstyd', 3)
  })
})

describe('an unrated chip and a threshold', () => {
  it('is not flagged, because there is no number to compare', () => {
    /** `intensity ?? 0` would have read an unanswered question as a low answer
     *  — and on a threshold of 0 it would have flagged it as a high one. */
    renderSelector([{ emotion: STRES, intensity: null }], { [STRES]: 0 })

    expect(screen.getByText('nie podano'))
      .not.toHaveClass('emotion-intensity-value-alert')
    expect(screen.queryByText(/wysokie/)).not.toBeInTheDocument()
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

describe('EmotionSelector — WCAG 1.4.1: the alert is not only a colour', () => {
  /**
   * At and above the threshold the value used to turn `--color-error` and
   * nothing else changed. A reader who cannot tell that red from the emotion's
   * own hue — or anyone using a screen reader — saw "8/10" and never learned
   * the app had flagged it.
   */
  it('says the rating is high in words once it crosses the threshold', () => {
    renderSelector([{ emotion: STRES, intensity: 7 }], { [STRES]: 6 })

    expect(screen.getByText(/wysokie/)).toBeInTheDocument()
  })

  it('says nothing below the threshold', () => {
    renderSelector([{ emotion: STRES, intensity: 5 }], { [STRES]: 6 })

    expect(screen.queryByText(/wysokie/)).toBeNull()
  })

  it('says nothing when no threshold applies to the emotion', () => {
    renderSelector([{ emotion: STRES, intensity: 10 }])

    expect(screen.queryByText(/wysokie/)).toBeNull()
  })
})
