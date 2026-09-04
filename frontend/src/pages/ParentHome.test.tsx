import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import ParentHome from './ParentHome'
import { ROUTES } from '../routes'

vi.mock('../api/guardian', () => ({
  fetchGuardianInvitations: vi.fn(),
  fetchGuardianChildren: vi.fn(),
  acceptGuardianInvitation: vi.fn(),
  rejectGuardianInvitation: vi.fn(),
}))
const { fetchGuardianInvitations, fetchGuardianChildren } = await import('../api/guardian')
const mockedFetch = vi.mocked(fetchGuardianInvitations)
const mockedChildren = vi.mocked(fetchGuardianChildren)

const LINKED_CHILD = {
  id: 'c0000000-0000-0000-0000-000000000001',
  childName: 'Ola',
  childSurname: 'Testowa',
  childEmail: 'dziecko@wp.pl',
  linkedAt: '2026-08-12T09:31:02Z',
  consentsActive: true,
  activity: { entryCount: 12, streakDays: 4, lastEntryDate: '2026-09-01' },
}

/** A guardian: role 'rodzic', and no `patient` row of any kind. */
const GUARDIAN = { ...TEST_USER, role: 'rodzic', isPatient: false, isChild: null }

const INVITATION = {
  id: 'd0000000-0000-0000-0000-000000000001',
  childName: 'Ola',
  childSurname: 'Testowa',
  childEmail: 'dziecko@wp.pl',
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedFetch.mockResolvedValue([])
  mockedChildren.mockReset()
  mockedChildren.mockResolvedValue([])
})

function renderScreen(user = GUARDIAN) {
  return renderWithProviders(<ParentHome />, { user, route: ROUTES.parentHome })
}

describe('ParentHome', () => {
  it('greets the signed-in guardian by name', async () => {
    renderScreen({ ...GUARDIAN, firstName: 'Jakub' })

    expect(await screen.findByText('Cześć, Jakub')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Panel rodzica' })).toBeInTheDocument()
  })

  it('greets an account with no first name without an empty line', async () => {
    renderScreen({ ...GUARDIAN, firstName: null })

    expect(await screen.findByText('Cześć')).toBeInTheDocument()
  })

  it('shows one placeholder, and marks it as unbuilt rather than as a feature', async () => {
    renderScreen()

    expect(
      await screen.findByRole('heading', { name: 'Panel rodzica powstaje' }),
    ).toBeInTheDocument()
    expect(screen.getByText('W BUDOWIE')).toBeInTheDocument()
  })

  it('does not promise what a guardian will be able to see of the child', async () => {
    /** THE POINT OF THE WORDING. What a guardian may read of a minor's record is
     *  undecided and is not a UI question — the diary is health data the child
     *  writes about themselves and the reports are written for the treating
     *  specialist. A placeholder naming those would answer it in markup, and a
     *  client reviewing this screen would read it as settled. */
    renderScreen()

    const placeholder = (await screen.findByRole('heading', { name: 'Panel rodzica powstaje' }))
      .closest('.parent-placeholder') as HTMLElement
    // Scoped to the card. The screen's own subtitle does say "dzienniczek", but
    // about the guardian's — "nie prowadzisz tu własnego" — which is the
    // opposite claim and has to stay.
    expect(within(placeholder).queryByText(/dzienniczk/i)).toBeNull()
    expect(within(placeholder).queryByText(/raport/i)).toBeNull()
    expect(within(placeholder).getByText(/jest jeszcze ustalana/i)).toBeInTheDocument()
  })

  it('offers none of the patient modules — a guardian has no diary of their own', async () => {
    renderScreen()

    await screen.findByRole('heading', { name: 'Panel rodzica powstaje' })
    expect(screen.queryByRole('button', { name: /Psychoterapia/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Dietetyka/ })).toBeNull()
  })
})

describe('ParentHome — the invitation card came with the guardian', () => {
  /**
   * It used to live on /modules, which is where every account landed. Guardians
   * are redirected off that screen now, so leaving the card behind would have
   * stranded every child mid-signup: a minor's account stays blocked until this
   * is answered (RODO art. 8) and nobody else can answer it.
   */
  it('is asked for, and renders what a guardian has to decide on', async () => {
    mockedFetch.mockResolvedValue([INVITATION])

    renderScreen()

    expect(await screen.findByRole('button', { name: /zaakceptuj/i })).toBeInTheDocument()
    expect(screen.getByText(/Ola Testowa/)).toBeInTheDocument()
  })

  it('sits above the placeholder, because somebody is waiting on it', async () => {
    mockedFetch.mockResolvedValue([INVITATION])

    const { container } = renderScreen()
    await screen.findByRole('button', { name: /zaakceptuj/i })

    const card = container.querySelector('.invitations')
    const placeholder = container.querySelector('.parent-placeholder')
    // compareDocumentPosition: 4 = the argument follows the node it is called on.
    expect(card?.compareDocumentPosition(placeholder!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('reaches the placeholder even when the invitations fail to load', async () => {
    /** The two are independent: a failed card must not take the screen with it,
     *  and the card says so itself rather than rendering nothing. */
    mockedFetch.mockImplementation(() => Promise.reject(new Error('sieć')))

    renderScreen()

    expect(
      await screen.findByRole('heading', { name: 'Panel rodzica powstaje' }),
    ).toBeInTheDocument()
  })
})

describe('ParentHome — the way out', () => {
  it('gives a guardian a menu with their own screens and nothing else', async () => {
    /** Every patient entry answers a guardian 403 and App.tsx redirects them
     *  away, so a menu listing them would offer links the router undoes. */
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.parentHome,
    )
    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', ROUTES.profile)
    for (const absent of ['Dzienniczki', 'Raporty', 'Analiza', 'Plan bezpieczeństwa']) {
      expect(screen.queryByRole('link', { name: absent })).toBeNull()
    }
  })

  it('can sign out, or the guardian is stranded on a placeholder', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<ParentHome />, { user: GUARDIAN, route: ROUTES.parentHome, signOut })

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })
})

describe('ParentHome — the child summary', () => {
  it('shows the linked child between the invitation card and the placeholder', async () => {
    mockedChildren.mockResolvedValue([LINKED_CHILD])

    const { container } = renderScreen()

    expect(await screen.findByRole('heading', { name: 'Ola Testowa' })).toBeInTheDocument()
    const summary = container.querySelector('.child-section')
    const placeholder = container.querySelector('.parent-placeholder')
    // 4 = the argument follows the node it is called on.
    expect(summary?.compareDocumentPosition(placeholder!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('summarises the account without a word about its contents', async () => {
    mockedChildren.mockResolvedValue([LINKED_CHILD])

    renderScreen()

    await screen.findByRole('heading', { name: 'Ola Testowa' })
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/nie widzisz treści jego wpisów/i)).toBeInTheDocument()
  })

  it('does not ask for children on a screen a guardian has not reached', async () => {
    /** The request goes out from this screen only, and only the guardian gets
     *  this screen — App.tsx guards it. */
    renderScreen()

    await screen.findByRole('heading', { name: 'Panel rodzica powstaje' })
    expect(mockedChildren).toHaveBeenCalledTimes(1)
  })

  it('still reaches the placeholder when the summary fails to load', async () => {
    mockedChildren.mockImplementation(() => Promise.reject(new Error('sieć')))

    renderScreen()

    expect(
      await screen.findByRole('heading', { name: 'Panel rodzica powstaje' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się wczytać/)
  })

  it('shows no summary section for a guardian with no accepted link', async () => {
    const { container } = renderScreen()

    await screen.findByRole('heading', { name: 'Panel rodzica powstaje' })
    await waitFor(() => expect(container.querySelector('.child-section')).toBeNull())
  })
})
