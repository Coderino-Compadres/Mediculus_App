import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import TimeField, { parseTime } from './TimeField'

/**
 * The field that replaced `<input type="time">`.
 *
 * The reason it exists is the first test here: the native control draws
 * "02:46 PM" on a browser set to English, whatever the page's `lang` says, and
 * this app is a Polish clinical diary. Everything else in this file is about
 * not making that trade twice — the value contract has to stay the native one,
 * or the four screens that render it would each need their own handling.
 */

/** The field is controlled, so the tests drive it through a real parent. */
function Harness({
  initial = '',
  onChange,
}: {
  initial?: string
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="t">Godzina</label>
      <TimeField
        id="t"
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
      />
      <output data-testid="reported">{value}</output>
    </>
  )
}

describe('the 24-hour clock', () => {
  it('never renders am or pm, whatever the browser locale is', async () => {
    render(<Harness initial="14:46" />)

    expect(screen.getByLabelText('Godzina')).toHaveValue('14:46')
    expect(document.body.textContent).not.toMatch(/[ap]\.?\s?m\.?/i)
  })

  it('is a text field, because that is the only way to control the format', () => {
    render(<Harness initial="14:46" />)

    const field = screen.getByLabelText('Godzina')
    expect(field).toHaveAttribute('type', 'text')
    // On a phone this is what a native picker is traded for.
    expect(field).toHaveAttribute('inputMode', 'numeric')
  })

  it('takes an afternoon hour as 14, not as 2', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('Godzina'), '1446')

    expect(screen.getByLabelText('Godzina')).toHaveValue('14:46')
    expect(onChange).toHaveBeenLastCalledWith('14:46')
  })
})

describe('typing', () => {
  it('puts the colon in by itself', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '0')
    expect(field).toHaveValue('0')
    await userEvent.type(field, '8')
    expect(field).toHaveValue('08:')
    await userEvent.type(field, '10')
    expect(field).toHaveValue('08:10')
  })

  /** A first digit over 2 cannot open an hour, so it is one — the shortcut the
   *  native control had and the reason typing 9 does not strand somebody. */
  it('reads a lone 9 as nine o\'clock and moves on to the minutes', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '9')
    expect(field).toHaveValue('09:')

    await userEvent.type(field, '30')
    expect(field).toHaveValue('09:30')
  })

  /**
   * One Backspace, one digit — the colon is punctuation the mask owns, not a
   * character to delete on its own. The field must also reach empty: an early
   * version put the colon straight back after every delete, so '14:' survived
   * any number of Backspaces and the hour could not be cleared by keyboard.
   */
  it('deletes a digit at a time, all the way to empty', async () => {
    render(<Harness initial="14:46" />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '{Backspace}')
    expect(field).toHaveValue('14:4')

    await userEvent.type(field, '{Backspace}')
    expect(field).toHaveValue('14')

    await userEvent.type(field, '{Backspace}{Backspace}')
    expect(field).toHaveValue('')
  })

  it('ignores letters', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, 'g1o4d4z6')
    expect(field).toHaveValue('14:46')
  })

  it('pads a colon typed by hand once the field is left', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '9:5')
    await userEvent.tab()

    expect(field).toHaveValue('09:05')
  })
})

describe('what it reports upwards', () => {
  /** The native contract: a complete time, or nothing. A half-typed "14:" is
   *  not a time, and the four screens rely on that to decide what to save. */
  it('says nothing while the time is unfinished', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '14')
    expect(screen.getByTestId('reported')).toHaveTextContent('')

    await userEvent.type(field, '46')
    expect(screen.getByTestId('reported')).toHaveTextContent('14:46')
  })

  it('goes back to saying nothing when the time is cleared', async () => {
    const onChange = vi.fn()
    render(<Harness initial="14:46" onChange={onChange} />)

    await userEvent.clear(screen.getByLabelText('Godzina'))

    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.getByLabelText('Godzina')).toHaveValue('')
  })
})

describe('a time that is not a time', () => {
  it('is named rather than erased or silently corrected', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '2570')

    // What was typed stays on screen — the app does not invent a value nobody
    // chose, and does not throw away one somebody did.
    expect(field).toHaveValue('25:70')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(/od 00:00 do 23:59/)
    expect(screen.getByTestId('reported')).toHaveTextContent('')
  })

  it('says nothing while somebody is still mid-keystroke', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '14:')

    expect(field).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('takes the message away once the time is right', async () => {
    render(<Harness />)
    const field = screen.getByLabelText('Godzina')

    await userEvent.type(field, '2570')
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await userEvent.clear(field)
    await userEvent.type(field, '1446')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(field).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('parseTime', () => {
  it('accepts every hour of the day', () => {
    expect(parseTime('00:00')).toBe('00:00')
    expect(parseTime('23:59')).toBe('23:59')
    expect(parseTime('9:5')).toBe('09:05')
  })

  it('refuses what a clock cannot show', () => {
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('23:60')).toBeNull()
    expect(parseTime('25:70')).toBeNull()
    expect(parseTime('14')).toBeNull()
    expect(parseTime('14:')).toBeNull()
    expect(parseTime('')).toBeNull()
    expect(parseTime('2:30 pm')).toBeNull()
  })
})
