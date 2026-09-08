import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PhoneLink from './PhoneLink'

/**
 * A crisis line, or the person a patient named in their safety plan, as
 * something you can actually call.
 *
 * A real anchor rather than a button with a handler, because on a phone this has
 * to place the call in one tap and also be long-pressable, copyable and
 * reachable from a keyboard. And its accessible name has to say *whose* number
 * it is: read on its own, '800 70 2222' is a string of numerals with no clue
 * what answering it means, and the sentence that explains it is not part of the
 * link — so it never reaches somebody tabbing through them.
 */

const LINE = { dial: '800702222', display: '800 70 2222' }

describe('PhoneLink', () => {
  it('is a tel: link on the unpunctuated number', () => {
    /** A space or a dash in the href is dialled by some handsets and dropped by
     *  others, which is why `dial` and `display` are two strings. */
    render(<PhoneLink phone={LINE} label="Telefon zaufania" />)

    expect(screen.getByRole('link', { name: /Telefon zaufania/ }))
      .toHaveAttribute('href', 'tel:800702222')
  })

  it('shows the number grouped the way the line publishes it', () => {
    render(<PhoneLink phone={LINE} label="Telefon zaufania" />)

    expect(screen.getByRole('link', { name: /Telefon zaufania/ })).toHaveTextContent('800 70 2222')
  })

  it('names the owner and the number in its accessible name', () => {
    render(<PhoneLink phone={LINE} label="Telefon zaufania dla dorosłych" />)

    expect(
      screen.getByRole('link', {
        name: 'Telefon zaufania dla dorosłych, zadzwoń pod numer 800 70 2222',
      }),
    ).toBeInTheDocument()
  })

  it('keeps a leading + for an international line', () => {
    render(
      <PhoneLink phone={{ dial: '+48800702222', display: '+48 800 70 2222' }} label="Linia" />,
    )

    expect(screen.getByRole('link', { name: /Linia/ }))
      .toHaveAttribute('href', 'tel:+48800702222')
  })

  it('takes the screen\'s own class so it looks like the list it sits in', () => {
    render(<PhoneLink phone={LINE} label="Linia" className="crisis-line-number" />)

    expect(screen.getByRole('link', { name: /Linia/ })).toHaveClass('crisis-line-number')
  })
})
