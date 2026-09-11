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
const updateMeal = vi.fn()
const fetchDietDay = vi.fn()
vi.mock('../api/diet', () => ({
  createMeal: (...args: unknown[]) => createMeal(...args),
  updateMeal: (...args: unknown[]) => updateMeal(...args),
  fetchDietDay: () => fetchDietDay(),
}))

const navigate = vi.fn()
/** Which URL the form is on. `renderWithProviders` mounts the component
 *  directly rather than through a `<Route path>`, so `useParams` has nothing
 *  to read — it is steered here, the same way `useNavigate` already is. */
let params: { id?: string } = {}
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
  useParams: () => params,
}))

const SAVED_DAY = {
  date: '2026-09-10', streakDays: 1, mealCount: 1,
  meals: [{ id: 'm1', kind: 'Obiad', time: '13:30', description: '' }],
}

beforeEach(() => {
  params = {}
  createMeal.mockReset()
  createMeal.mockResolvedValue({
    meal: { id: 'm1', kind: 'Obiad', time: '13:30', description: '' },
    day: SAVED_DAY,
  })
  updateMeal.mockReset()
  updateMeal.mockResolvedValue({
    meal: { id: 'm1', kind: 'Obiad', time: '13:30', description: '' },
    day: SAVED_DAY,
  })
  fetchDietDay.mockReset()
  fetchDietDay.mockResolvedValue(SAVED_DAY)
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

describe('the same form, correcting one of today\'s meals', () => {
  /**
   * ONE COMPONENT FOR BOTH, because the rules about what a meal may hold —
   * six kinds, an optional hour, a description that may be empty, nothing
   * required — belong in one place. A second form would be a second set of
   * them, free to disagree with the first.
   */
  const MEAL: { id: string; kind: string | null; time: string | null; description: string } = {
    id: 'm1', kind: 'Kolacja', time: '19:30', description: 'Naleśniki.',
  }

  function renderEdit(meals = [MEAL]) {
    params = { id: 'm1' }
    fetchDietDay.mockResolvedValue({
      date: '2026-09-10', streakDays: 1, mealCount: meals.length, meals,
    })
    return render()
  }

  it('says it is an edit rather than an addition', async () => {
    renderEdit()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edycja posiłku' }),
    ).toBeInTheDocument()
  })

  it('fills the form from the meal rather than from now', async () => {
    /** The hour pre-filled with the current time is right when adding and
     *  wrong when correcting: it would silently rewrite the hour of any meal
     *  somebody opened to fix a typo in its description. */
    renderEdit()

    expect(await screen.findByLabelText(/Godzina posiłku/)).toHaveValue('19:30')
    expect(screen.getByLabelText(/Opis posiłku/)).toHaveValue('Naleśniki.')
    expect(screen.getByRole('button', { name: 'Kolacja' })).toHaveAttribute(
      'aria-pressed', 'true',
    )
  })

  it('shows an unanswered hour as an empty box, not as this moment', async () => {
    renderEdit([{ ...MEAL, time: null, kind: null }])

    expect(await screen.findByLabelText(/Godzina posiłku/)).toHaveValue('')
  })

  it('puts the whole form back, so a cleared field is an answer taken back', async () => {
    renderEdit()
    await screen.findByDisplayValue('Naleśniki.')

    await userEvent.clear(screen.getByLabelText(/Opis posiłku/))
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() =>
      expect(updateMeal).toHaveBeenCalledWith('m1', {
        kind: 'Kolacja', time: '19:30', description: '',
      }),
    )
    expect(createMeal).not.toHaveBeenCalled()
  })

  it('returns to the home screen, which is where the meal is listed', async () => {
    renderEdit()
    await screen.findByDisplayValue('Naleśniki.')

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(ROUTES.diet, {
        state: { savedMeal: true },
      }),
    )
  })

  it('draws no form at all when the meal is not today\'s', async () => {
    /** A form that can only fail is worse than a sentence saying why. The id
     *  is looked up among today's meals, so a miss means archived or somebody
     *  else's — from here the same fact. */
    renderEdit([])

    expect(await screen.findByText(/tylko dzisiejsze wpisy/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zapisz zmiany' })).toBeNull()
    expect(screen.queryByLabelText(/Opis posiłku/)).toBeNull()
  })

  it('reports a failed load rather than drawing an empty meal over it', async () => {
    params = { id: 'm1' }
    fetchDietDay.mockRejectedValue(new ApiError(403, 'Najpierw udziel zgód.'))

    render()

    expect(await screen.findByText('Najpierw udziel zgód.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zapisz zmiany' })).toBeNull()
  })

  it('asks for no day, on an edit either', async () => {
    /** A meal cannot be moved between days — the server refuses, so a browser
     *  that tried would be ignored rather than told. */
    renderEdit()
    await screen.findByDisplayValue('Naleśniki.')

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() => expect(updateMeal).toHaveBeenCalled())
    expect(Object.keys(updateMeal.mock.calls[0][1]).sort()).toEqual(
      ['description', 'kind', 'time'],
    )
  })

  it('adding still says "Dodawanie" and posts', async () => {
    /** The other half of one component: the add path is unchanged. */
    render()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Dodawanie posiłku' }),
    ).toBeInTheDocument()
    expect(fetchDietDay).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Zapisz posiłek' }))

    await waitFor(() => expect(createMeal).toHaveBeenCalled())
    expect(updateMeal).not.toHaveBeenCalled()
  })
})
