import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import OfflineBanner from './OfflineBanner'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

afterEach(() => setOnline(true))

describe('OfflineBanner', () => {
  it('says nothing while there is a connection', () => {
    setOnline(true)

    const { container } = render(<OfflineBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('explains the situation when there is not', () => {
    setOnline(false)

    render(<OfflineBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(/brak połączenia z internetem/i)
  })

  it('appears when the connection drops while the app is open', () => {
    setOnline(true)
    render(<OfflineBanner />)

    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('goes away again when the connection comes back', () => {
    setOnline(false)
    render(<OfflineBanner />)

    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says waiting is the fix, which "Nie udało się wczytać" does not', () => {
    // The screens' own error wording invites an immediate retry; that is the
    // wrong advice for a phone in a lift, and the reason this banner exists.
    setOnline(false)

    render(<OfflineBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(/gdy wrócisz do sieci/i)
  })
})
