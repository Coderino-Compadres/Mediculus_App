import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import HeaderMenu from './HeaderMenu'
import { ROUTES } from '../routes'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Menu' }))

beforeEach(() => navigate.mockReset())

describe('HeaderMenu', () => {
  it('starts closed', () => {
    renderWithProviders(<HeaderMenu />)

    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('offers the way back to the home screen', async () => {
    // Several screens have no back arrow of their own, so without this the
    // menu is a one-way trip away from /home.
    renderWithProviders(<HeaderMenu />)
    await openMenu()

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.home,
    )
  })

  it('puts the home entry first', async () => {
    renderWithProviders(<HeaderMenu />)
    await openMenu()

    const [first] = screen.getAllByRole('link')

    expect(first).toHaveTextContent('Strona główna')
  })

  it('marks the screen the reader is already on', async () => {
    renderWithProviders(<HeaderMenu />, { route: ROUTES.reports })
    await openMenu()

    expect(screen.getByRole('link', { name: 'Raporty' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Strona główna' })).not.toHaveAttribute('aria-current')
  })

  it('names the account role in Polish rather than printing the column', async () => {
    renderWithProviders(<HeaderMenu />, { user: { ...TEST_USER, role: 'patient' } })
    await openMenu()

    expect(screen.getByText('Pacjent')).toBeInTheDocument()
    expect(screen.queryByText('patient')).toBeNull()
  })

  it('shows a role it does not recognise rather than hiding it', async () => {
    renderWithProviders(<HeaderMenu />, { user: { ...TEST_USER, role: 'dietetyk' } })
    await openMenu()

    expect(screen.getByText('dietetyk')).toBeInTheDocument()
  })
})

describe('HeaderMenu — the keyboard', () => {
  it('closes on Escape', async () => {
    renderWithProviders(<HeaderMenu />)
    await openMenu()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('gives the focus back to the button it came from', async () => {
    // Otherwise closing drops a keyboard user at the top of the document, to
    // walk the whole header again.
    renderWithProviders(<HeaderMenu />)
    await openMenu()

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus()
  })

  it('Escape does nothing while the menu is closed', async () => {
    renderWithProviders(<HeaderMenu />)

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('HeaderMenu — signing out', () => {
  it('lands on the login screen even when the request fails', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('network down'))
    renderWithProviders(<HeaderMenu />, { signOut })
    await openMenu()

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    expect(signOut).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith(ROUTES.login, { replace: true })
  })
})
