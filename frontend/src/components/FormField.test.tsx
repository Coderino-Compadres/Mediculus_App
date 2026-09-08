import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormField from './FormField'

/**
 * The input every form on the app is built from — registration, login, the
 * guardian form, the password form, the closure confirmation.
 *
 * What is worth pinning is the accessibility wiring, because it is invisible
 * when it breaks and it breaks for exactly the people who depend on it: the
 * label has to point at the input (a tap on the words has to focus the field on
 * a phone), the error has to be *announced* through `aria-describedby` rather
 * than only drawn next to the box, and `name` has to default to the id — that is
 * what makes `useAuthForm`'s single `handleChange` able to place a value at all.
 */

describe('FormField', () => {
  it('ties its label to its input, so tapping the words focuses the field', async () => {
    render(<FormField id="email" label="Adres e-mail" />)

    const input = screen.getByLabelText('Adres e-mail')

    await userEvent.click(screen.getByText('Adres e-mail'))

    expect(input).toHaveFocus()
  })

  it('names the input after its id, which is how one handler serves a whole form', () => {
    /** `useAuthForm.handleChange` reads `event.target.name`; an input with no
     *  name would type into nothing. */
    render(<FormField id="password" label="Hasło" />)

    expect(screen.getByLabelText('Hasło')).toHaveAttribute('name', 'password')
  })

  it('passes the caller\'s attributes straight through', () => {
    render(
      <FormField
        id="password"
        label="Hasło"
        type="password"
        autoComplete="new-password"
        placeholder="min. 8 znaków"
        value=""
        onChange={() => {}}
      />,
    )

    const input = screen.getByLabelText('Hasło')

    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    expect(input).toHaveAttribute('placeholder', 'min. 8 znaków')
  })

  it('is valid and describes nothing while there is no error', () => {
    render(<FormField id="email" label="Adres e-mail" />)

    const input = screen.getByLabelText('Adres e-mail')

    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('announces an error through the input rather than only drawing it', () => {
    render(<FormField id="email" label="Adres e-mail" error="Podaj adres e-mail." />)

    const input = screen.getByLabelText('Adres e-mail')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Podaj adres e-mail.')
  })

  it('reports a change under its own name', async () => {
    const onChange = vi.fn()
    render(<FormField id="email" label="Adres e-mail" value="" onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('Adres e-mail'), 'a')

    expect(onChange.mock.calls[0][0].target.name).toBe('email')
  })

  it('can be disabled while a form is submitting', () => {
    render(<FormField id="email" label="Adres e-mail" disabled />)

    expect(screen.getByLabelText('Adres e-mail')).toBeDisabled()
  })
})
