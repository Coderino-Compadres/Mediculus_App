import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConsentField from './ConsentField'

/**
 * The RODO consent checkboxes on the registration form.
 *
 * Two properties matter beyond the wiring: the box is **controlled** (the value
 * lives in the form, which is what lets registration send the consent moments
 * it actually recorded), and it is never pre-ticked by this component — a
 * consent the user did not give is the one thing a consent checkbox must not
 * imply (art. 7).
 */

describe('ConsentField', () => {
  it('ties its label to the box, so the sentence itself is tappable', async () => {
    const onChange = vi.fn()
    render(
      <ConsentField
        id="dataConsent"
        label="Zgadzam się na przetwarzanie danych o zdrowiu."
        checked={false}
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByText('Zgadzam się na przetwarzanie danych o zdrowiu.'))

    expect(onChange).toHaveBeenCalled()
  })

  it('is a checkbox that shows exactly the state it was given', () => {
    const { rerender } = render(
      <ConsentField id="dataConsent" label="Zgoda" checked={false} onChange={() => {}} />,
    )

    expect(screen.getByRole('checkbox', { name: 'Zgoda' })).not.toBeChecked()

    rerender(
      <ConsentField id="dataConsent" label="Zgoda" checked onChange={() => {}} />,
    )

    expect(screen.getByRole('checkbox', { name: 'Zgoda' })).toBeChecked()
  })

  it('reports a tick under its own name', async () => {
    // Read inside the handler, like the select's: the box is controlled, so it
    // is back to unchecked by the time an assertion could look at the node.
    const seen: { name: string; checked: boolean }[] = []
    render(
      <ConsentField
        id="servicesConsent"
        label="Zgoda"
        checked={false}
        onChange={(event) => seen.push({ name: event.target.name, checked: event.target.checked })}
      />,
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Zgoda' }))

    expect(seen).toEqual([{ name: 'servicesConsent', checked: true }])
  })

  it('announces a missing consent through the box', () => {
    render(
      <ConsentField
        id="dataConsent"
        label="Zgoda"
        checked={false}
        onChange={() => {}}
        error="Ta zgoda jest wymagana."
      />,
    )

    const box = screen.getByRole('checkbox', { name: 'Zgoda' })

    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription('Ta zgoda jest wymagana.')
  })

  it('is valid and describes nothing until the form complains', () => {
    render(<ConsentField id="dataConsent" label="Zgoda" checked={false} onChange={() => {}} />)

    const box = screen.getByRole('checkbox', { name: 'Zgoda' })

    expect(box).toHaveAttribute('aria-invalid', 'false')
    expect(box).not.toHaveAttribute('aria-describedby')
  })
})
