import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoadError from './LoadError'

/**
 * A failed load with something to press.
 *
 * It exists because four screens said "Spróbuj ponownie" as plain text and
 * offered nothing to act on: the only way to follow that instruction was to
 * reload by hand, which on a phone means finding the browser chrome a
 * standalone PWA has hidden.
 */

describe('LoadError', () => {
  it('says what failed and offers a button to ask again', async () => {
    const onRetry = vi.fn()
    render(
      <LoadError message="Nie udało się wczytać raportów." onRetry={onRetry} className="x" />,
    )

    expect(screen.getByText('Nie udało się wczytać raportów.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('is announced, because it replaces content the reader was waiting for', () => {
    render(<LoadError message="Nie udało się wczytać." onRetry={() => {}} className="x" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wczytać.')
  })

  it('wears the classes of the box it stands in for', () => {
    /** Each screen passes its own status classes, so the failure looks like the
     *  element it replaced rather than like a foreign widget. */
    render(
      <LoadError
        message="Nie udało się wczytać."
        onRetry={() => {}}
        className="journals-status journals-status-error"
      />,
    )

    expect(screen.getByRole('alert')).toHaveClass('journals-status', 'journals-status-error')
  })

  it('can be pressed more than once, because a second failure is not the end of it', async () => {
    const onRetry = vi.fn()
    render(<LoadError message="Nie udało się." onRetry={onRetry} className="x" />)

    const retry = screen.getByRole('button', { name: 'Spróbuj ponownie' })
    await userEvent.click(retry)
    await userEvent.click(retry)

    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('does not submit a form it happens to sit inside', () => {
    /** `type="button"`: several of these live on screens built around a form,
     *  and a default submit button would send it. */
    render(<LoadError message="Nie udało się." onRetry={() => {}} className="x" />)

    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
      .toHaveAttribute('type', 'button')
  })
})
