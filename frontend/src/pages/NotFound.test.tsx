import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import NotFound from './NotFound'
import { ROUTES } from '../routes'

/**
 * The `*` route. It used to redirect to /modules, which was wrong twice over: a
 * mistyped link looked like it had worked, and a stale bookmark to a screen that
 * has moved gave no hint that anything was off.
 */

describe('NotFound', () => {
  it('says the address names no screen', async () => {
    renderWithProviders(<NotFound />, { route: '/nie-ma-takiego-ekranu' })

    expect(screen.getByRole('heading', { name: 'Nie ma takiej strony' })).toBeInTheDocument()
    expect(screen.getByText(/nie prowadzi do żadnego ekranu/)).toBeInTheDocument()
  })

  it('offers the way back into the app', async () => {
    renderWithProviders(<NotFound />, { route: '/nie-ma-takiego-ekranu' })

    expect(screen.getByRole('link', { name: /Wróć do aplikacji/ }))
      .toHaveAttribute('href', ROUTES.modules)
  })

  it('does not pretend the mistyped address worked', async () => {
    /** Nothing here should read as a screen: no diary, no reports, no data of
     *  any kind — just the fact that this address leads nowhere. */
    renderWithProviders(<NotFound />, { route: '/journals/typo' })

    expect(screen.queryByText(/dzienniczek|raport|wpis/i)).toBeNull()
  })
})
