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

describe('HeaderMenu — a guardian account', () => {
  /**
   * A guardian has no `patient` row, so every patient entry answers them 403 and
   * App.tsx redirects them off those routes. The menu has to agree with the
   * router: a link the router immediately undoes is worse than no link.
   */
  const GUARDIAN = { ...TEST_USER, role: 'rodzic', isPatient: false, isChild: null }

  it('leads home to the parent panel, not to the patient dashboard', async () => {
    renderWithProviders(<HeaderMenu />, { user: GUARDIAN })
    await openMenu()

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.parentHome,
    )
  })

  it('offers the profile, which is genuinely theirs', async () => {
    /** Identity, the consent register and the password form all work for a
     *  guardian; only the clinical half of that screen is left out. */
    renderWithProviders(<HeaderMenu />, { user: GUARDIAN })
    await openMenu()

    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', ROUTES.profile)
  })

  it('offers nothing from the patient app', async () => {
    renderWithProviders(<HeaderMenu />, { user: GUARDIAN })
    await openMenu()

    for (const href of [
      ROUTES.home, ROUTES.journals, ROUTES.reports, ROUTES.analysis,
      ROUTES.techniques, ROUTES.safetyPlan, ROUTES.diet,
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeNull()
    }
  })

  it('still signs out — it is the only way off the parent screen', async () => {
    renderWithProviders(<HeaderMenu />, { user: GUARDIAN })
    await openMenu()

    expect(screen.getByRole('button', { name: 'Wyloguj' })).toBeInTheDocument()
  })

  it('leaves the patient menu untouched', async () => {
    renderWithProviders(<HeaderMenu />, { user: TEST_USER })
    await openMenu()

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.home,
    )
    expect(screen.getByRole('link', { name: 'Dzienniczki' })).toBeInTheDocument()
  })
})

describe('inside the diet module', () => {
  /**
   * The menu is the one place on a diet screen that says what the module holds,
   * so it must not list the other module's screens. It is picked by route
   * rather than by role, because both modules belong to one account.
   *
   * The list itself is provisional — §03 of the mockups ("Menu i przełączanie
   * modułów") is what settles it — so what is pinned here is the boundary,
   * not the final set of entries.
   */
  const openAt = async (route: string) => {
    renderWithProviders(<HeaderMenu />, { user: TEST_USER, route })
    await openMenu()
  }

  it('offers the diet home rather than the psychotherapy one', async () => {
    await openAt(ROUTES.diet)

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.diet,
    )
  })

  it('lists none of the psychotherapy screens', async () => {
    /** The bug this replaced: a patient under a header reading DIETETYKA was
     *  offered the emotion diary, its reports, its analysis and the DBT
     *  catalogue. */
    await openAt(ROUTES.diet)

    for (const href of [
      ROUTES.journals, ROUTES.reports, ROUTES.analysis,
      ROUTES.techniques, ROUTES.safetyPlan, ROUTES.diaryEntry,
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeNull()
    }

    // /home is the one psychotherapy address that stays, and only as the way
    // back to that module — never as this module's "Strona główna".
    const toPsychotherapy = document.querySelectorAll(`a[href="${ROUTES.home}"]`)

    expect(toPsychotherapy).toHaveLength(1)
    expect(toPsychotherapy[0]).toHaveTextContent('Przejdź do części psychoterapeutycznej')
  })

  it('keeps the way back to the other module', async () => {
    /** Mirroring the entry the psychotherapy menu already carries in the
     *  opposite direction — the module switch is what §03 is named after. */
    await openAt(ROUTES.diet)

    expect(
      screen.getByRole('link', { name: 'Przejdź do części psychoterapeutycznej' }),
    ).toHaveAttribute('href', ROUTES.home)
  })

  it('keeps the profile, because one account has one profile', async () => {
    await openAt(ROUTES.diet)

    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', ROUTES.profile)
  })

  it('still signs out', async () => {
    await openAt(ROUTES.diet)

    expect(screen.getByRole('button', { name: 'Wyloguj' })).toBeInTheDocument()
  })

  it('covers the screens under /diet as well, not just its home', async () => {
    await openAt(ROUTES.dietMeal)

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.diet,
    )
  })

  it('marks the diet home as the current page when you are on it', async () => {
    await openAt(ROUTES.diet)

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'aria-current', 'page',
    )
  })

  it('leaves the psychotherapy menu alone', async () => {
    /** The regression that matters in the other direction: /home keeps every
     *  entry it had, including the one that leads into the diet module. */
    await openAt(ROUTES.home)

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.home,
    )
    expect(screen.getByRole('link', { name: 'Dzienniczki' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Przejdź do części dietetycznej i psychodietetycznej' }),
    ).toHaveAttribute('href', ROUTES.diet)
  })

  it('does not hand a specialist the patient menu, whatever the address says', async () => {
    /** Role is asked first: a specialist who somehow reached /diet is
     *  redirected by App.tsx, and until that happens the menu must not offer
     *  them a patient's screens. */
    renderWithProviders(<HeaderMenu />, {
      user: { ...TEST_USER, isPatient: false, isSpecialist: true, role: 'specjalista' },
      route: ROUTES.diet,
    })
    await openMenu()

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute(
      'href', ROUTES.specialistHome,
    )
  })
})
