import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FORM_ERROR, useAuthForm, type FormErrors } from './useAuthForm'
import { ApiError } from '../api/client'

interface Values extends Record<string, string> {
  email: string
  password: string
}

function Harness({
  validate = () => ({}),
  submit = async () => {},
  fields = {},
}: {
  validate?: (values: Values) => FormErrors
  submit?: (values: Values) => Promise<void>
  fields?: Record<string, string>
}) {
  const form = useAuthForm<Values>({ email: '', password: '' })
  return (
    <form onSubmit={(event) => form.handleSubmit(event, { validate, submit, fields })}>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" value={form.values.email} onChange={form.handleChange} />
      <label htmlFor="password">Hasło</label>
      <input id="password" name="password" value={form.values.password} onChange={form.handleChange} />
      <span data-testid="status">{form.status}</span>
      <span data-testid="form-error">{form.formError ?? ''}</span>
      <span data-testid="email-error">{form.errors.email ?? ''}</span>
      <span data-testid="password-error">{form.errors.password ?? ''}</span>
      <button type="submit" disabled={form.submitting}>Wyślij</button>
    </form>
  )
}

async function submitForm() {
  await userEvent.click(screen.getByRole('button', { name: 'Wyślij' }))
}

describe('typing', () => {
  it('keeps the values it is given', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.pl')

    expect(screen.getByLabelText('E-mail')).toHaveValue('a@b.pl')
  })

  it('stops shouting a form-level rejection once the user edits', async () => {
    render(<Harness validate={() => ({ [FORM_ERROR]: 'Coś nie gra.' })} />)
    await submitForm()
    expect(screen.getByTestId('form-error')).toHaveTextContent('Coś nie gra.')

    await userEvent.type(screen.getByLabelText('E-mail'), 'a')

    expect(screen.getByTestId('form-error')).toHaveTextContent('')
  })
})

describe('client-side validation', () => {
  it('does not send anything when a check fails', async () => {
    const submit = vi.fn()
    render(<Harness validate={() => ({ email: 'Podaj e-mail.' })} submit={submit} />)

    await submitForm()

    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByTestId('email-error')).toHaveTextContent('Podaj e-mail.')
  })

  it('puts a cross-field complaint above the form, not under one input', async () => {
    // Blaming either field alone would be arbitrary — the same reason DRF has
    // non_field_errors.
    render(<Harness validate={() => ({ [FORM_ERROR]: 'Hasła nie są identyczne.' })} />)

    await submitForm()

    expect(screen.getByTestId('form-error')).toHaveTextContent('Hasła nie są identyczne.')
    expect(screen.getByTestId('email-error')).toHaveTextContent('')
  })

  it('sends when every check passes', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    render(<Harness submit={submit} />)

    await submitForm()

    expect(submit).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('success')
  })
})

describe('the server\'s verdict', () => {
  it('lands a field error on the input that produced it', async () => {
    // The server validates independently, so it rejects things the browser let
    // through — a taken address, a password Django's validators dislike.
    const submit = vi.fn().mockRejectedValue(
      new ApiError(400, null, { email: 'Ten adres jest już zajęty.' }),
    )
    render(<Harness submit={submit} fields={{ email: 'email' }} />)

    await submitForm()

    expect(await screen.findByText('Ten adres jest już zajęty.')).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })

  it('re-keys an API field name to the form field it belongs to', async () => {
    const submit = vi.fn().mockRejectedValue(
      new ApiError(400, null, { password_confirm: 'Hasła nie pasują.' }),
    )
    render(<Harness submit={submit} fields={{ password_confirm: 'password' }} />)

    await submitForm()

    expect(await screen.findByText('Hasła nie pasują.')).toBeInTheDocument()
  })

  it('shows a form-level message above the inputs', async () => {
    const submit = vi.fn().mockRejectedValue(new ApiError(429, 'Zbyt wiele prób.'))
    render(<Harness submit={submit} />)

    await submitForm()

    expect(await screen.findByText('Zbyt wiele prób.')).toBeInTheDocument()
  })

  it('falls back to a generic message for something that is not an ApiError', async () => {
    const submit = vi.fn().mockRejectedValue(new TypeError('boom'))
    render(<Harness submit={submit} />)

    await submitForm()

    expect(await screen.findByText('Coś poszło nie tak. Spróbuj ponownie.')).toBeInTheDocument()
  })

  it('re-enables the button after a rejection, so the form can be resubmitted', async () => {
    const submit = vi.fn().mockRejectedValue(new ApiError(500, null))
    render(<Harness submit={submit} />)

    await submitForm()

    expect(screen.getByRole('button', { name: 'Wyślij' })).toBeEnabled()
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })
})
