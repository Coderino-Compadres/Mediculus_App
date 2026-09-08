import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useStoredTechniques } from './useStoredTechniques'
import type { StoredTechnique } from '../api/techniques'

vi.mock('../api/techniques', () => ({ fetchStoredTechniques: vi.fn() }))
const { fetchStoredTechniques } = await import('../api/techniques')
const mockedFetch = vi.mocked(fetchStoredTechniques)

/**
 * The catalogue's database half, and the one thing this hook must never do:
 * take the built-in half down with it. Those techniques need no network at all,
 * so a failed request has to end as an empty list plus a flag the screen can
 * word in a line — never as an error the whole catalogue is replaced by.
 *
 * `pages/Techniques.test.tsx` covers what the screen does with `failed`; this is
 * the hook's own contract, including the state it starts in and the update it
 * must not perform after unmounting.
 */

function technique(overrides: Partial<StoredTechnique> = {}): StoredTechnique {
  return {
    id: 'oddech-4-7-8',
    idTechnique: 4,
    nazwa: 'Oddech 4-7-8',
    podtytul: 'Spowolnienie oddechu.',
    szkola: ['relaksacyjne'],
    dostepnosc: 'ogolna',
    wprowadzenie: 'Kiedy trudno się uspokoić.',
    kroki: [{ opis: 'Wdech na cztery.' }],
    opisGotowy: true,
    ...overrides,
  } as StoredTechnique
}

function Probe() {
  const { techniques, loading, failed } = useStoredTechniques()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="failed">{String(failed)}</span>
      <span data-testid="ids">{techniques.map((one) => one.id).join(',')}</span>
    </div>
  )
}

beforeEach(() => {
  mockedFetch.mockReset()
})

describe('while the request is in flight', () => {
  it('reports loading, with nothing loaded and nothing failed', () => {
    mockedFetch.mockReturnValueOnce(new Promise(() => {}))

    render(<Probe />)

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
    expect(screen.getByTestId('ids')).toHaveTextContent('')
  })

  it('asks the API exactly once', async () => {
    mockedFetch.mockResolvedValueOnce([technique()])

    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })
})

describe('when the techniques arrive', () => {
  it('hands them over in the order the API sent them', async () => {
    mockedFetch.mockResolvedValueOnce([
      technique({ id: 'pierwsza' }),
      technique({ id: 'druga' }),
    ])

    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('pierwsza,druga'))
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('treats "no specialist has written one" as an empty list, not a problem', async () => {
    mockedFetch.mockResolvedValueOnce([])

    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
    expect(screen.getByTestId('ids')).toHaveTextContent('')
  })
})

describe('when the request fails', () => {
  it('fails soft: an empty list plus a flag, never a thrown error', async () => {
    /** The built-in catalogue is still complete without this half. Showing
     *  eleven techniques and saying some may be missing is far better than an
     *  error page over content that needs no network. */
    mockedFetch.mockRejectedValueOnce(new Error('503'))

    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'))
    expect(screen.getByTestId('ids')).toHaveTextContent('')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('stops loading, so the screen is not left waiting forever', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('network'))

    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
  })
})

describe('unmounting', () => {
  it('does not set state after the component is gone', async () => {
    /** The screens mount this and navigate away freely — a late `setState` here
     *  is a warning in the console and, on a slow connection, on every tap. */
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args))

    let resolve: (value: StoredTechnique[]) => void = () => {}
    mockedFetch.mockReturnValueOnce(new Promise((done) => { resolve = done }))

    const { unmount } = render(<Probe />)
    unmount()
    resolve([technique()])
    await Promise.resolve()

    expect(errors).toEqual([])
    spy.mockRestore()
  })
})
