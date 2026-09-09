import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Stepper from './Stepper'

/**
 * The shared minus/value/plus control.
 *
 * Rendered without the app's providers because it needs none — no router, no
 * session, no stylesheet-dependent behaviour. What is pinned is the wiring that
 * is invisible when it breaks: that the buttons carry the field's own name, that
 * the value is announced rather than silently swapped, and that the floor is a
 * floor without the button falling out of the tab order when you reach it.
 */

function setup(props: Partial<Parameters<typeof Stepper>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <Stepper id="test-stepper" label="Czas trwania" value={30} onChange={onChange} {...props} />,
  )
  return { onChange }
}

describe('the value', () => {
  it('is announced rather than silently swapped', () => {
    // <output> has an implicit role of `status`, so a screen reader reads the
    // new number after a press without the button describing what it did.
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('30')
  })

  it('is written through the caller\'s own formatter', () => {
    setup({ value: 35, formatValue: (current: number) => `${current} min` })
    expect(screen.getByRole('status')).toHaveTextContent('35 min')
  })
})

describe('the buttons', () => {
  it('carry the field name, so they say which number they move', () => {
    // "mniej" and "więcej" on their own are meaningless in a list of controls
    // read out of context — and this screen has two steppers on it.
    setup()
    expect(screen.getByRole('button', { name: 'Czas trwania: mniej' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Czas trwania: więcej' })).toBeInTheDocument()
  })

  it('move the value by one step in each direction', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ value: 30, step: 5 })

    await user.click(screen.getByRole('button', { name: 'Czas trwania: więcej' }))
    expect(onChange).toHaveBeenCalledWith(35)

    await user.click(screen.getByRole('button', { name: 'Czas trwania: mniej' }))
    expect(onChange).toHaveBeenLastCalledWith(25)
  })

  it('step by one when no step is given', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ label: 'Przebudzenia w nocy', value: 1 })

    await user.click(screen.getByRole('button', { name: 'Przebudzenia w nocy: więcej' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })
})

describe('the floor and the ceiling', () => {
  it('will not go below the minimum', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ label: 'Przebudzenia w nocy', value: 0, min: 0 })

    await user.click(screen.getByRole('button', { name: 'Przebudzenia w nocy: mniej' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says so without dropping the button out of the tab order', () => {
    /**
     * The button at its own limit is `aria-disabled`, not `disabled`. A truly
     * disabled button loses focus the moment it is pressed into the limit,
     * which throws a keyboard user to the top of the document mid-interaction —
     * the control works and then loses you. This is the assertion that stops
     * somebody "tidying" it into a real `disabled`.
     */
    setup({ label: 'Przebudzenia w nocy', value: 0, min: 0 })
    const minus = screen.getByRole('button', { name: 'Przebudzenia w nocy: mniej' })

    expect(minus).toHaveAttribute('aria-disabled', 'true')
    expect(minus).not.toBeDisabled()
  })

  it('will not go above a maximum when one is given', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ value: 10, max: 10 })

    await user.click(screen.getByRole('button', { name: 'Czas trwania: więcej' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Czas trwania: więcej' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('is unbounded upwards by default', () => {
    setup({ value: 99999 })
    expect(screen.getByRole('button', { name: 'Czas trwania: więcej' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  })
})

describe('a read-only day', () => {
  it('still shows the value and moves nothing', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ value: 35, disabled: true })

    // The figure is a record of what was written, so it stays legible; only the
    // controls go away. Here `disabled` proper is right — nothing on the card
    // is meant to be interactive.
    expect(screen.getByRole('status')).toHaveTextContent('35')
    const plus = screen.getByRole('button', { name: 'Czas trwania: więcej' })
    expect(plus).toBeDisabled()

    await user.click(plus)
    expect(onChange).not.toHaveBeenCalled()
  })
})
