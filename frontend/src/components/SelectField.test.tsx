import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectField from './SelectField'

/**
 * The select the registration form, the technique form and the guardian-code
 * form all use.
 *
 * The placeholder is the interesting part: it is an option with an **empty
 * value**, so "not answered" is a state the form can read — the technique form
 * turns that empty string into NULL rather than sending a value outside the
 * vocabulary, and the guardian-code form keeps its button disabled until it is
 * gone.
 */

const OPTIONS = [
  { value: 'kryzys', label: 'W kryzysie' },
  { value: 'odpornosc', label: 'Codzienna odporność' },
]

describe('SelectField', () => {
  it('ties its label to the select', () => {
    render(<SelectField id="dbtGroup" label="Grupa w zakładce DBT" options={OPTIONS} />)

    expect(screen.getByLabelText('Grupa w zakładce DBT').tagName).toBe('SELECT')
  })

  it('offers the options it was given, in order', () => {
    render(<SelectField id="dbtGroup" label="Grupa" options={OPTIONS} />)

    const options = within(screen.getByLabelText('Grupa')).getAllByRole('option')

    expect(options.map((option) => option.textContent))
      .toEqual(['W kryzysie', 'Codzienna odporność'])
  })

  it('puts the placeholder first and gives it no value', () => {
    /** An empty value is what lets a caller tell "not answered" from an answer
     *  — the technique form sends NULL for it rather than an empty string. */
    render(
      <SelectField id="dbtGroup" label="Grupa" placeholder="Bez grupy" options={OPTIONS} />,
    )

    const [first] = within(screen.getByLabelText('Grupa')).getAllByRole('option')

    expect(first).toHaveTextContent('Bez grupy')
    expect(first).toHaveValue('')
  })

  it('renders no placeholder when none was asked for', () => {
    render(<SelectField id="dbtGroup" label="Grupa" options={OPTIONS} />)

    expect(within(screen.getByLabelText('Grupa')).getAllByRole('option')).toHaveLength(2)
  })

  it('reports a choice under its own name', async () => {
    // Read inside the handler: the select is controlled, so by the time the
    // assertion runs React has re-rendered the node back to `value=""` and the
    // event's target is that same live node.
    const seen: { name: string; value: string }[] = []
    render(
      <SelectField
        id="dbtGroup"
        label="Grupa"
        placeholder="Bez grupy"
        options={OPTIONS}
        value=""
        onChange={(event) => seen.push({ name: event.target.name, value: event.target.value })}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Grupa'), 'kryzys')

    expect(seen).toEqual([{ name: 'dbtGroup', value: 'kryzys' }])
  })

  it('announces an error through the select', () => {
    render(
      <SelectField id="patientId" label="Pacjent" options={OPTIONS} error="Wybierz pacjenta." />,
    )

    const select = screen.getByLabelText('Pacjent')

    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Wybierz pacjenta.')
  })

  it('is valid and describes nothing while there is no error', () => {
    render(<SelectField id="patientId" label="Pacjent" options={OPTIONS} />)

    const select = screen.getByLabelText('Pacjent')

    expect(select).toHaveAttribute('aria-invalid', 'false')
    expect(select).not.toHaveAttribute('aria-describedby')
  })

  it('renders an empty list without a placeholder as a select with nothing in it', () => {
    /** The guardian-code screen never shows this — it says why there is no form
     *  instead — but a select that quietly offers nothing must not throw. */
    render(<SelectField id="patientId" label="Pacjent" options={[]} />)

    expect(within(screen.getByLabelText('Pacjent')).queryAllByRole('option')).toHaveLength(0)
  })
})
