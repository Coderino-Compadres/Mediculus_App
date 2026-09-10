import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietMealForm from './DietMealForm'
import { ROUTES } from '../routes'
import { MEAL_KINDS } from '../utils/meals'
import { ApiError } from '../api/client'

/**
 * §04's "Dodawanie posiłku".
 *
 * Two properties carry most of this file. **Nothing blocks a save** — §05 says
 * so outright, and it is meant literally: the button is never disabled by the
 * form's own state and an empty meal is written. And **nothing on the screen
 * measures food**: no product search, no portion, no weight, no calories. The
 * sweep at the bottom is what a well-meant "completion" of this screen has to
 * get past.
 */

const createMeal = vi.fn()
vi.mock('../api/diet', () => ({ createMeal: (...args: unknown[]) => createMeal(...args) }))

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

beforeEach(() => {
  createMeal.mockReset()
  createMeal.mockResolvedValue({
    meal: { id: 'm1', kind: 'Obiad', time: '13:30', description: '' },
    day: { date: '2026-09-10', streakDays: 1, mealCount: 1 },
  })
  navigate.mockReset()
})

function render() {
  return renderWithProviders(<DietMealForm />)
}

describe('the form', () => {
  it('offers exactly the kinds the backend accepts, in the order of a day', () => {
    render()

    for (const kind of MEAL_KINDS) {
      expect(screen.getByRole('button', { name: kind })).toBeInTheDocument()
    }
  })

  it('says once that nothing is required, rather than marking every field', () => {
    render()

    expect(screen.getByText(/Nic tu nie jest wymagane/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\*/)
  })

  it('sends what was chosen', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Obiad' }))
    await userEvent.type(screen.getByLabelText('Opis posiłku'), 'Zupa.')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1))
    expect(createMeal.mock.calls[0][0]).toMatchObject({
      kind: 'Obiad',
      description: 'Zupa.',
    })
  })

  it('saves a meal that answered nothing at all', async () => {
    /** §05 taken literally: an entry recording only that a meal happened. */
    render()

    await userEvent.clear(screen.getByLabelText('Godzina posiłku'))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1))
    expect(createMeal.mock.calls[0][0]).toEqual({
      kind: null, time: null, description: '',
    })
  })

  it('lets a chosen kind be taken back by pressing it again', async () => {
    render()

    const chip = screen.getByRole('button', { name: 'Kolacja' })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))
    await waitFor(() => expect(createMeal).toHaveBeenCalled())
    expect(createMeal.mock.calls[0][0].kind).toBeNull()
  })

  it('fills the hour in with now, visibly and editably', async () => {
    /**
     * The one thing this screen answers for the patient, and it is defensible
     * only because the value is on screen and one tap from being changed or
     * cleared — the opposite of the diary's untouched sliders, which wrote a 0
     * nobody chose because nothing said they had.
     */
    render()

    const hour = screen.getByLabelText('Godzina posiłku')
    expect((hour as HTMLInputElement).value).toMatch(/^\d{2}:\d{2}$/)

    await userEvent.clear(hour)
    await userEvent.type(hour, '09:15')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    await waitFor(() => expect(createMeal).toHaveBeenCalled())
    expect(createMeal.mock.calls[0][0].time).toBe('09:15')
  })

  it('never sends a date, because the server stamps the day', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    await waitFor(() => expect(createMeal).toHaveBeenCalled())
    expect(Object.keys(createMeal.mock.calls[0][0]).sort())
      .toEqual(['description', 'kind', 'time'])
  })

  it('goes to the history once the meal is written, and says so there', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith(
      ROUTES.dietJournals, { state: { savedMeal: true } },
    )
  })
})

describe('when the write fails', () => {
  it("shows the server's own sentence and stays on the form", async () => {
    /**
     * Every refusal a patient can actually reach here is a gate — an account
     * waiting on a guardian, or one whose consents are not in force — and each
     * arrives with a message saying what to do about it. Throwing it away for a
     * generic line is the mistake the other three diet screens were corrected
     * for.
     */
    createMeal.mockRejectedValue(new ApiError(403, 'Poczekaj na zgodę opiekuna.'))
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Poczekaj na zgodę opiekuna.')
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Zapisz posiłek' })).toBeEnabled()
  })

  it('falls back to its own sentence when there was none', async () => {
    createMeal.mockRejectedValue(new Error('network'))
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się zapisać/)
  })
})

describe('what this screen refuses to show', () => {
  /**
   * §04: the module "nie liczy jedzenia". Among these patients are people with
   * eating disorders, so a number entered next to a meal is precisely what it
   * is built without — and each of these is a line somebody "completes" the
   * screen across.
   */
  it('offers no product search', () => {
    render()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(document.body.textContent).not.toMatch(/wyszukaj|szukaj produkt/i)
  })

  it('asks for no quantity of any kind', () => {
    render()
    expect(document.body.textContent).not.toMatch(/kalori|kcal|gram|waga|porcj|makro|białk|węglowod|tłuszcz/i)
  })

  it('has no numeric input on it', () => {
    render()
    expect(document.querySelector('input[type="number"]')).toBeNull()
  })

  it('does not promise a photo it cannot store', () => {
    /** The module's open question — naming it here would answer it in markup. */
    render()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/zdjęci|fotograf/i)
  })

  it('judges nothing about the meal', () => {
    render()
    expect(document.body.textContent).not.toMatch(/zdrow|niezdrow|dobry wybór|za dużo|ocen/i)
  })
})
