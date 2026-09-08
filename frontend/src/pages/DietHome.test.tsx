import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import DietHome from './DietHome'
import { APP_DISCLAIMER } from '../utils/disclaimer'
import { ROUTES } from '../routes'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

/**
 * The diet module's home screen, against the mockups it was built from.
 *
 * Most of what is pinned here is *absence*, and deliberately so: the module's
 * whole premise is a diary that does not count food ("nie liczy jedzenia —
 * opisuje je i to, co dzieje się wokół niego"), and the mockups say out loud
 * that the screens carry no product search and no numeric field. Those are the
 * lines somebody completes the screen across without noticing, so they are
 * tests rather than comments.
 *
 * The second thing pinned is that nothing on the screen is invented. The mockup
 * is drawn with sample data — a streak of 6, a half-drawn hydration bar — and
 * there is no backend behind any of it. A patient sees zeros, because zeros are
 * what the app can stand behind.
 */

beforeEach(() => {
  navigate.mockReset()
})

describe('the header and the greeting', () => {
  it('names the module and the screen', () => {
    renderWithProviders(<DietHome />)

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Strona główna' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument()
  })

  it('greets the signed-in patient by name', () => {
    renderWithProviders(<DietHome />)

    expect(screen.getByText('Dzień dobry, Test')).toBeInTheDocument()
  })

  it('greets an account with no first name without a trailing comma', () => {
    renderWithProviders(<DietHome />, { user: { ...TEST_USER, firstName: null } })

    expect(screen.getByText('Dzień dobry')).toBeInTheDocument()
  })

  it("writes today's date with its weekday, and the month in lowercase", () => {
    /** The mockup writes "piątek, 14 sierpnia". Four other stylesheets put
     *  `text-transform: capitalize` on this kind of label, which renders
     *  "8 września" as "8 Września" — Polish month names are lowercase, and
     *  this screen does not repeat that. Asserted on the text rather than the
     *  CSS because the text is what a reader gets either way. */
    const expected = new Date().toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

    renderWithProviders(<DietHome />)

    expect(screen.getByText(expected)).toBeInTheDocument()
    expect(expected).toMatch(/^[a-ząćęłńóśźż]/)
  })
})

describe('the empty day', () => {
  it('says the diary is still empty, in the mockup\'s own words', () => {
    renderWithProviders(<DietHome />)

    expect(screen.getByText('DZISIEJSZY DZIENNICZEK')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jeszcze pusty' })).toBeInTheDocument()
    expect(
      screen.getByText(/Zapisz posiłek wtedy, kiedy masz na to chwilę/),
    ).toBeInTheDocument()
  })

  it('says a meal can be written on its own, not the whole day at once', () => {
    /** The sentence is the module's promise about effort, and it is the reason
     *  the entry form is allowed to save with nothing filled in. */
    renderWithProviders(<DietHome />)

    expect(screen.getByText(/Nie musisz opisywać całego dnia naraz/)).toBeInTheDocument()
  })

  it('offers exactly one action, and it leads to the meal form', () => {
    renderWithProviders(<DietHome />)

    // The header's hamburger carries an aria-label and no text of its own, so
    // "every action on the screen" is every button that says something.
    const labelled = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter(Boolean)

    expect(labelled).toEqual(['Dodaj posiłek'])
  })

  it('goes to "Dodawanie posiłku" — a real destination, not a dead button', async () => {
    renderWithProviders(<DietHome />)

    await userEvent.click(screen.getByRole('button', { name: 'Dodaj posiłek' }))

    expect(navigate).toHaveBeenCalledWith(ROUTES.dietMeal)
  })
})

describe('nawodnienie', () => {
  it('reads out of the target rather than spelling a number into the screen', () => {
    renderWithProviders(<DietHome />)

    expect(screen.getByRole('heading', { name: 'Nawodnienie' })).toBeInTheDocument()
    expect(screen.getByText('0 z 6 szklanek')).toBeInTheDocument()
  })

  it('is a reading and not a control — adding a glass belongs to its own screen', () => {
    /** §08 of the mockups is "Nawodnienie i suplementy". A "+1" invented on the
     *  home screen would be a second place writing the same number. */
    renderWithProviders(<DietHome />)

    expect(screen.queryByRole('button', { name: /szklank|\+/i })).toBeNull()
  })

  it('does not announce the bar twice', () => {
    /** The count is already on screen as text; the bar is decoration. */
    renderWithProviders(<DietHome />)

    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('"Jak się dziś jadło?"', () => {
  it('is on the screen before there is anything to summarise', () => {
    /** Kept visible and explained, rather than hidden until the day goes well —
     *  a card that appeared only on some days would make its absence a verdict.
     *  The same reasoning as the report's risky-behaviour section. */
    renderWithProviders(<DietHome />)

    expect(screen.getByRole('heading', { name: 'Jak się dziś jadło?' })).toBeInTheDocument()
    expect(screen.getByText(/wypełni się samo, kiedy zapiszesz pierwszy posiłek/))
      .toBeInTheDocument()
  })
})

describe('what the screen refuses to show', () => {
  it('invents no figures — the mockup\'s sample streak is not a patient\'s streak', () => {
    /** The mockup is drawn with "6 dni z rzędu". Nothing writes a meal yet, so
     *  the only true streak is 0. The home screen's technique card was removed
     *  from the app for exactly this reason: it could only ever show seed data. */
    renderWithProviders(<DietHome />)

    const streak = screen.getByText('dni z rzędu').parentElement!

    expect(within(streak).getByText('0')).toBeInTheDocument()
    expect(within(streak).queryByText('6')).toBeNull()
  })

  it('counts no calories and no macros', () => {
    /** "Dzienniczek żywieniowy, który nie liczy jedzenia." Not a gap to fill. */
    renderWithProviders(<DietHome />)

    for (const forbidden of [/kcal/i, /kalori/i, /makro/i, /białk/i, /węglowodan/i, /tłuszcz/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('offers no product search and no numeric field', () => {
    /** The mockups' own scope note on §04: a photo and a description are the
     *  only two sources of a meal's content. */
    renderWithProviders(<DietHome />)

    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('says nothing about a weight or a diet plan', () => {
    /** Neither is in the patient's mockups, and both would be a claim about
     *  what this module is for. */
    renderWithProviders(<DietHome />)

    for (const forbidden of [/waga/i, /wagi/i, /jadłospis/i, /plan żywieniowy/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })
})

describe('the disclaimer', () => {
  it('is the app\'s one shared sentence, not a second wording', () => {
    /** The mockup words it differently on this screen. One sentence about the
     *  app's own limits, in one place — see utils/disclaimer.ts, and the
     *  TODO(klientka) in the component about which wording wins. */
    renderWithProviders(<DietHome />)

    expect(screen.getByText(APP_DISCLAIMER)).toBeInTheDocument()
  })
})
