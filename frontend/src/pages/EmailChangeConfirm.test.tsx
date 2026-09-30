import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../test/render'
import EmailChangeConfirm, { MISSING_TOKEN, SUCCESS } from './EmailChangeConfirm'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'

vi.mock('../api/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account')>()
  return { ...actual, confirmEmailChange: vi.fn() }
})
const { confirmEmailChange } = await import('../api/account')
const mockedConfirm = vi.mocked(confirmEmailChange)

/**
 * The page the link mailed to a new address opens. The one decision worth
 * pinning: **opening it changes nothing** — mail scanners open links — and only
 * the button sends the token.
 */

function renderAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path={ROUTES.emailChangeConfirm} element={<EmailChangeConfirm />} />
      <Route path="/email-change" element={<EmailChangeConfirm />} />
    </Routes>,
    { route: path, user: null },
  )
}

beforeEach(() => {
  mockedConfirm.mockReset()
})

describe('EmailChangeConfirm', () => {
  it('sends nothing when the page is merely opened', async () => {
    renderAt('/email-change/abc123')

    expect(await screen.findByRole('button', { name: 'Potwierdź nowy adres' })).toBeInTheDocument()
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('confirms with the token from the link, then sends the person to log in', async () => {
    mockedConfirm.mockResolvedValue(undefined)
    renderAt('/email-change/abc123')

    await userEvent.click(await screen.findByRole('button', { name: 'Potwierdź nowy adres' }))

    expect(mockedConfirm).toHaveBeenCalledWith('abc123')
    expect(await screen.findByText(SUCCESS)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Przejdź do logowania' }))
      .toHaveAttribute('href', ROUTES.login)
    expect(screen.queryByRole('button', { name: 'Potwierdź nowy adres' })).toBeNull()
  })

  it('shows the server\'s reason when the link no longer works', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(400, 'Link jest nieprawidłowy.'))
    renderAt('/email-change/stary')

    await userEvent.click(await screen.findByRole('button', { name: 'Potwierdź nowy adres' }))

    expect(await screen.findByText('Link jest nieprawidłowy.')).toBeInTheDocument()
    expect(screen.queryByText(SUCCESS)).toBeNull()
  })

  it('says so when the address carries no token', async () => {
    renderAt('/email-change')

    expect(await screen.findByText(MISSING_TOKEN)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Potwierdź nowy adres' })).toBeNull()
  })
})
