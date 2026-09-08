import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollapsibleCard from './CollapsibleCard'

/**
 * The folding card the profile's account-settings sections sit in.
 *
 * The load-bearing detail is that a closed card holds **no body in the DOM** at
 * all, rather than a hidden one: a hidden form's inputs stay reachable by
 * keyboard and a screen reader reads fields nobody asked for — and on this
 * screen those fields are a password form and an e-mail change.
 */

describe('CollapsibleCard', () => {
  it('starts closed, with its body not merely hidden but absent', () => {
    render(
      <CollapsibleCard title="Zmień hasło">
        <button type="button">Zapisz nowe hasło</button>
      </CollapsibleCard>,
    )

    expect(screen.queryByRole('button', { name: 'Zapisz nowe hasło' })).toBeNull()
  })

  it('opens and closes on its own heading', async () => {
    render(
      <CollapsibleCard title="Zmień hasło">
        <p>treść</p>
      </CollapsibleCard>,
    )

    const toggle = screen.getByRole('button', { name: /Zmień hasło/ })

    await userEvent.click(toggle)
    expect(screen.getByText('treść')).toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.queryByText('treść')).toBeNull()
  })

  it('says whether it is open, so the state is not carried by the chevron alone', async () => {
    render(
      <CollapsibleCard title="Zmień hasło">
        <p>treść</p>
      </CollapsibleCard>,
    )

    const toggle = screen.getByRole('button', { name: /Zmień hasło/ })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('points aria-controls at the body only while the body exists', async () => {
    /** Collapsed, it would name an id that is not in the document — which some
     *  screen readers report as a broken reference rather than ignoring. */
    render(
      <CollapsibleCard title="Zmień hasło">
        <p>treść</p>
      </CollapsibleCard>,
    )

    const toggle = screen.getByRole('button', { name: /Zmień hasło/ })

    expect(toggle).not.toHaveAttribute('aria-controls')

    await userEvent.click(toggle)
    const bodyId = toggle.getAttribute('aria-controls')

    expect(bodyId).toBeTruthy()
    expect(document.getElementById(bodyId!)).toHaveTextContent('treść')
  })

  it('can start open where a screen wants it open', async () => {
    render(
      <CollapsibleCard title="Zmień hasło" defaultOpen>
        <p>treść</p>
      </CollapsibleCard>,
    )

    expect(screen.getByText('treść')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zmień hasło/ }))
      .toHaveAttribute('aria-expanded', 'true')
  })

  it('gives two cards on one screen different body ids', async () => {
    /** The id is generated rather than passed in, so nothing forces a caller to
     *  invent one — and two cards must not both claim the same. */
    render(
      <>
        <CollapsibleCard title="Pierwsza" defaultOpen><p>a</p></CollapsibleCard>
        <CollapsibleCard title="Druga" defaultOpen><p>b</p></CollapsibleCard>
      </>,
    )

    const [first, second] = screen.getAllByRole('button')

    expect(first.getAttribute('aria-controls')).not.toBe(second.getAttribute('aria-controls'))
  })
})
