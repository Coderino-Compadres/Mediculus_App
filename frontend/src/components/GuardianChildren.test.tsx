import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import GuardianChildren from './GuardianChildren'
import { ApiError } from '../api/client'
import type { LinkedChild } from '../api/guardian'

vi.mock('../api/guardian', () => ({ fetchGuardianChildren: vi.fn() }))
const { fetchGuardianChildren } = await import('../api/guardian')
const mockedFetch = vi.mocked(fetchGuardianChildren)

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function child(overrides: Partial<LinkedChild> = {}): LinkedChild {
  return {
    id: 'd0000000-0000-0000-0000-000000000001',
    childName: 'Ola',
    childSurname: 'Testowa',
    childEmail: 'dziecko@wp.pl',
    linkedAt: '2026-08-12T09:31:02Z',
    activity: { entryCount: 12, streakDays: 4, lastEntryDate: isoDaysAgo(1) },
    ...overrides,
  }
}

async function render(children: LinkedChild[] = [child()]) {
  mockedFetch.mockResolvedValue(children)
  const result = renderWithProviders(<GuardianChildren />)
  await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
  return result
}

// Braces, not a bare arrow: `mockReset()` returns the mock, vitest treats a
// function returned from beforeEach as a teardown and calls it — which invoked
// the mock again after every test. With a pending promise that hung the next
// hook for ten seconds; with a rejecting one it produced an unhandled rejection
// nobody was there to catch.
beforeEach(() => {
  mockedFetch.mockReset()
})

describe('GuardianChildren', () => {
  it('names the child and says since when the link has held', async () => {
    await render()

    expect(await screen.findByRole('heading', { name: 'Ola Testowa' })).toBeInTheDocument()
    expect(screen.getByText('dziecko@wp.pl')).toBeInTheDocument()
    expect(screen.getByText(/od 12 sierpnia 2026/)).toBeInTheDocument()
  })

  it('summarises how much has been written and how recently', async () => {
    await render()

    await screen.findByRole('heading', { name: 'Ola Testowa' })

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('wpisów')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('wczoraj')).toBeInTheDocument()
  })

  it('hides a run of one, which is an entry rather than a streak', async () => {
    await render([child({
      activity: { entryCount: 1, streakDays: 1, lastEntryDate: isoDaysAgo(0) },
    })])

    await screen.findByRole('heading', { name: 'Ola Testowa' })

    expect(screen.getByText('wpis')).toBeInTheDocument()
    expect(screen.queryByText(/z rzędu/)).toBeNull()
    expect(screen.getByText('dzisiaj')).toBeInTheDocument()
  })

  it('says in words when the child has written nothing yet', async () => {
    /** The state a guardian most needs to notice, and three zeroes are not a
     *  sentence somebody reads at a glance. */
    await render([child({
      activity: { entryCount: 0, streakDays: 0, lastEntryDate: null },
    })])

    expect(await screen.findByText(/nie zapisało jeszcze żadnego wpisu/i)).toBeInTheDocument()
  })

  it('lists every linked child, with the heading in the plural', async () => {
    await render([
      child(),
      child({ id: 'd2', childName: 'Antoni', childSurname: 'Testowy', childEmail: 'a@wp.pl' }),
    ])

    expect(await screen.findByRole('heading', { name: 'Konta dzieci' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ola Testowa' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Antoni Testowy' })).toBeInTheDocument()
  })

  it('uses the singular heading for one child', async () => {
    await render()

    expect(await screen.findByRole('heading', { name: 'Konto dziecka' })).toBeInTheDocument()
  })

  it('handles a linked account that keeps no diary', async () => {
    await render([child({ activity: null })])

    expect(await screen.findByText(/nie prowadzi dzienniczka/i)).toBeInTheDocument()
    expect(screen.queryByText('wpisów')).toBeNull()
  })
})

describe('GuardianChildren — what it must not show', () => {
  /**
   * The omissions are the feature, not an unfinished state. A minor who knows a
   * parent reads their diary writes a different diary; the backend does not send
   * content (CHILD_SUMMARY_FIELDS in core/account.py) and this pins that the
   * screen neither asks for it nor invents it.
   */
  it('says plainly that the guardian is not reading the diary', async () => {
    await render()

    expect(
      await screen.findByText(/nie widzisz treści jego wpisów/i),
    ).toBeInTheDocument()
  })

  it('shows nothing clinical anywhere on the card', async () => {
    const { container } = await render()
    await screen.findByRole('heading', { name: 'Ola Testowa' })

    const text = container.textContent ?? ''
    for (const word of ['nastrój', 'nastroj', 'stres', 'emocj', 'lęk', 'ryzyk', 'raport']) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('offers no way into the child\'s own screens', async () => {
    /** There is no such endpoint, and a link that 403s would be worse than
     *  none — it would promise access the guardian does not have. */
    const { container } = await render()
    await screen.findByRole('heading', { name: 'Ola Testowa' })

    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('GuardianChildren — loading and failure', () => {
  it('renders nothing while it loads, rather than pushing the invitation card down', async () => {
    // A promise this test resolves itself, rather than one that never settles:
    // a pending request left behind wedges the next test's cleanup.
    let settle: (value: LinkedChild[]) => void = () => {}
    mockedFetch.mockImplementation(() => new Promise((resolve) => {
      settle = resolve
    }))

    const { container } = renderWithProviders(<GuardianChildren />)
    expect(container).toBeEmptyDOMElement()

    settle([child()])
    expect(await screen.findByRole('heading', { name: 'Ola Testowa' })).toBeInTheDocument()
  })

  it('says so when the load fails, rather than looking like "no children"', async () => {
    /** Silence would read as "nobody linked" to a guardian who has a child —
     *  the one wrong answer on this screen, since it is why they are here. */
    // mockImplementation, not mockRejectedValue: the latter builds the rejected
    // promise at this line, before anything attaches a .catch to it.
    mockedFetch.mockImplementation(() => Promise.reject(new ApiError(500, null)))

    renderWithProviders(<GuardianChildren />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się wczytać/)
  })

  it('renders nothing when no invitation has been accepted yet', async () => {
    /** The ordinary state for a guardian who has not answered: the invitation
     *  card above already tells them what to do. */
    const { container } = await render([])

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('asks the server exactly once', async () => {
    await render()
    await screen.findByRole('heading', { name: 'Ola Testowa' })

    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('keeps each child in its own card', async () => {
    const { container } = await render([
      child(),
      child({ id: 'd2', childName: 'Antoni', childSurname: 'Testowy',
              activity: { entryCount: 3, streakDays: 0, lastEntryDate: isoDaysAgo(6) } }),
    ])
    await screen.findByRole('heading', { name: 'Antoni Testowy' })

    const cards = container.querySelectorAll('.child-card')
    expect(cards).toHaveLength(2)
    expect(within(cards[1] as HTMLElement).getByText('6 dni temu')).toBeInTheDocument()
  })
})
