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
    consentsActive: true,
    // The ordinary card: no marker. A test about the marker sets it.
    needsAttention: false,
    activity: { entryCount: 12, streakDays: 4, lastEntryDate: isoDaysAgo(1) },
    // The diet module's own three, which the card draws as a second row. A
    // child using both modules is the ordinary case now that there are two.
    dietActivity: { entryCount: 8, streakDays: 2, lastEntryDate: isoDaysAgo(0) },
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

describe('a child whose consents are withdrawn', () => {
  it('says the account was stopped rather than that it has no diary', async () => {
    // The account *has* a diary and the app has stopped reading it. The older
    // sentence ("to konto nie prowadzi dzienniczka") would be false, and it
    // would send a worried parent looking for the wrong problem.
    mockedFetch.mockResolvedValueOnce([child({ consentsActive: false, activity: null })])

    renderWithProviders(<GuardianChildren />)

    expect(await screen.findByText(/wycofało zgody na przetwarzanie danych/i)).toBeInTheDocument()
    expect(screen.queryByText(/nie prowadzi dzienniczka/i)).toBeNull()
  })

  it('says nothing was deleted, because nothing was', async () => {
    mockedFetch.mockResolvedValueOnce([child({ consentsActive: false, activity: null })])

    renderWithProviders(<GuardianChildren />)

    expect(await screen.findByText(/Nic nie zostało usunięte/i)).toBeInTheDocument()
  })
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
    // Both modules quiet, so a streak tile from the other row cannot answer
    // this test's question for it.
    await render([child({
      activity: { entryCount: 1, streakDays: 1, lastEntryDate: isoDaysAgo(0) },
      dietActivity: { entryCount: 0, streakDays: 0, lastEntryDate: null },
    })])

    await screen.findByRole('heading', { name: 'Ola Testowa' })

    expect(screen.getByText('wpis')).toBeInTheDocument()
    expect(screen.queryByText(/z rzędu/)).toBeNull()
    expect(screen.getByText('dzisiaj')).toBeInTheDocument()
  })

  it('says in words when the child has written nothing yet', async () => {
    /** The state a guardian most needs to notice, and rows of zeroes are not a
     *  sentence somebody reads at a glance. Both modules empty: the claim is
     *  about the account, so one quiet diary is not enough to make it. */
    await render([child({
      activity: { entryCount: 0, streakDays: 0, lastEntryDate: null },
      dietActivity: { entryCount: 0, streakDays: 0, lastEntryDate: null },
    })])

    expect(await screen.findByText(/nie zapisało jeszcze żadnego wpisu ani posiłku/i))
      .toBeInTheDocument()
  })

  describe('the diet module', () => {
    /** The bug this row closes: the card read the psychotherapy diary and
     *  nothing else, so a child who uses only the diet module reached their
     *  guardian as an account nobody touches. See DIET_CHILD_SUMMARY_FIELDS in
     *  core/account.py for why the two are counted apart rather than summed. */

    it('draws a row per module, each under its own name', async () => {
      await render()

      await screen.findByRole('heading', { name: 'Ola Testowa' })

      expect(screen.getByRole('heading', { name: 'Psychoterapia' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Dietetyka i psychodietetyka' }))
        .toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('wpisów')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('posiłków')).toBeInTheDocument()
      expect(screen.getByText('ostatni posiłek')).toBeInTheDocument()
    })

    it('does not call a child who only keeps a food diary inactive', async () => {
      await render([child({
        activity: { entryCount: 0, streakDays: 0, lastEntryDate: null },
        dietActivity: { entryCount: 6, streakDays: 3, lastEntryDate: isoDaysAgo(0) },
      })])

      await screen.findByRole('heading', { name: 'Ola Testowa' })

      expect(screen.queryByText(/nie zapisało jeszcze/i)).toBeNull()
      expect(screen.getByText('6')).toBeInTheDocument()
    })

    it('declines the noun rather than printing "3 posiłków"', async () => {
      await render([child({
        dietActivity: { entryCount: 3, streakDays: 0, lastEntryDate: isoDaysAgo(2) },
      })])

      await screen.findByRole('heading', { name: 'Ola Testowa' })

      expect(screen.getByText('posiłki')).toBeInTheDocument()
    })

    it('draws no diet row when the backend does not send the figures', async () => {
      /** `dietActivity` is null on a backend that predates the field, and a row
       *  of zeroes there would claim the child keeps no food diary — a claim
       *  this client cannot make. */
      await render([child({ dietActivity: null })])

      await screen.findByRole('heading', { name: 'Ola Testowa' })

      expect(screen.queryByRole('heading', { name: 'Dietetyka i psychodietetyka' })).toBeNull()
      expect(screen.queryByText('ostatni posiłek')).toBeNull()
      // The psychotherapy row is untouched.
      expect(screen.getByText('12')).toBeInTheDocument()
    })

    it('says nothing about what the child ate', async () => {
      /** The line does not move with the second row: meals are counted, never
       *  described. The payload carries no kind, description or photo, and this
       *  pins that the card renders no place for one. */
      const { container } = await render()

      await screen.findByRole('heading', { name: 'Ola Testowa' })

      expect(container.textContent).not.toMatch(/obiad|śniadanie|kolacja|zdjęci/i)
      expect(screen.getByText(/nie widzisz treści jego wpisów ani tego, co je/i))
        .toBeInTheDocument()
    })
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

  it('names no reason even when the marker is there', async () => {
    /** The marker is the client's one exception, and it is worded as "look at
     *  the report" rather than as what is in it — the count and the reason are
     *  not in the payload at all. 'raport' is therefore the one word from the
     *  sweep above that a marked card may contain. */
    const { container } = await render([child({ needsAttention: true })])
    await screen.findByRole('heading', { name: /Ola Testowa/ })

    // 'dni' is not on this list and cannot be: "4 dni z rzędu" is the streak,
    // an engagement figure the card has always carried.
    const text = (container.textContent ?? '').toLowerCase()
    for (const word of ['ryzyk', 'nastrój', 'nastroj', 'stres', 'emocj', 'lęk']) {
      expect(text).not.toContain(word)
    }
    // And the marker's own words name no number either.
    expect(screen.getByRole('img').getAttribute('aria-label'))
      .toBe('Ostatni raport wymaga uwagi')
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

describe('GuardianChildren — the attention marker', () => {
  /**
   * The client's one exception to "engagement, never content": a marker next to
   * the child's name when their last weekly report flagged three or more risky
   * days. The decision it carries is *that* the guardian should look, not what
   * happened — so everything here is about the wording and about the marker
   * appearing next to the right name, never about a figure.
   */
  const ATTENTION = 'Ostatni raport wymaga uwagi'

  it('marks the child whose last report wants attention', async () => {
    await render([child({ needsAttention: true })])

    expect(await screen.findByRole('img', { name: ATTENTION })).toBeInTheDocument()
  })

  it('puts it next to the name, not loose on the card', async () => {
    /** A guardian with three children asks "which one" — a marker on the card's
     *  edge would answer "one of them". */
    await render([child({ needsAttention: true })])

    const heading = await screen.findByRole('heading', { name: /Ola Testowa/ })
    expect(within(heading).getByRole('img', { name: ATTENTION })).toBeInTheDocument()
  })

  it('says what it means rather than relying on the colour', async () => {
    /** An ochre glyph says nothing to a screen reader, and "yellow means bad" is
     *  not a message. `role="img"` plus a label is what makes the exclamation
     *  mark read as the sentence. */
    await render([child({ needsAttention: true })])

    const marker = await screen.findByRole('img', { name: ATTENTION })
    expect(marker).toHaveAttribute('title', ATTENTION)
  })

  it('leaves an ordinary card unmarked', async () => {
    await render([child()])
    await screen.findByRole('heading', { name: 'Ola Testowa' })

    expect(screen.queryByRole('img', { name: ATTENTION })).toBeNull()
    expect(screen.queryByText('!')).toBeNull()
  })

  it('marks only the child it belongs to', async () => {
    await render([
      child({ id: 'a', childName: 'Ola', needsAttention: false }),
      child({ id: 'b', childName: 'Jaś', needsAttention: true }),
    ])

    const ola = await screen.findByRole('heading', { name: /Ola/ })
    const jas = screen.getByRole('heading', { name: /Jaś/ })
    expect(within(ola).queryByRole('img')).toBeNull()
    expect(within(jas).getByRole('img', { name: ATTENTION })).toBeInTheDocument()
  })

  it('does not mark a locked account', async () => {
    /** Withdrawal stops the processing the marker would be derived from, so the
     *  backend sends false — and the card has its own sentence for that state,
     *  which a marker on top of would contradict. */
    await render([child({ consentsActive: false, activity: null, needsAttention: false })])
    await screen.findByRole('heading', { name: 'Ola Testowa' })

    expect(screen.queryByRole('img', { name: ATTENTION })).toBeNull()
    expect(screen.getByText(/zostało zatrzymane/i)).toBeInTheDocument()
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
