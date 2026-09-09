import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietHydration from './DietHydration'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import type { HydrationDay } from '../types/diet'

/**
 * "Nawodnienie" — §08 of the diet mockups.
 *
 * What is pinned here is mostly the client's own rules, because they are the
 * things a later pass "improves" without knowing they were decided:
 *
 *   - other drinks are recorded and **never** converted into water;
 *   - the goal is a point of reference and nothing on the screen is a verdict —
 *     no streak, no congratulation, no message about falling short;
 *   - the numbers come from the server and are never recomputed here, so the
 *     goal is not spelled into the markup and neither is the glass;
 *   - today is editable and nothing older is, which is the psychotherapy
 *     diary's rule applied to a second kind of row.
 */

const fetchHydration = vi.fn<() => Promise<HydrationDay>>()
const recordDrink = vi.fn<(amountMl: number | null, drink?: string) => Promise<HydrationDay>>()
const removeDrink = vi.fn<(id: string) => Promise<void>>()

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return {
    ...actual,
    fetchHydration: () => fetchHydration(),
    recordDrink: (amountMl: number | null, drink?: string) => recordDrink(amountMl, drink),
    removeDrink: (id: string) => removeDrink(id),
  }
})

function day(overrides: Partial<HydrationDay> = {}): HydrationDay {
  return {
    date: '2026-09-11',
    glassMl: 250,
    bottleMl: 500,
    targetGlasses: 6,
    minAmountMl: 10,
    maxAmountMl: 2000,
    waterMl: 1000,
    glasses: 4,
    progress: 0.667,
    entries: [],
    week: [
      { date: '2026-09-05', waterMl: 1000, glasses: 4 },
      { date: '2026-09-06', waterMl: 1250, glasses: 5 },
      { date: '2026-09-07', waterMl: 750, glasses: 3 },
      { date: '2026-09-08', waterMl: 1500, glasses: 6 },
      { date: '2026-09-09', waterMl: 0, glasses: 0 },
      { date: '2026-09-10', waterMl: 1750, glasses: 7 },
      { date: '2026-09-11', waterMl: 1000, glasses: 4 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  fetchHydration.mockReset()
  recordDrink.mockReset()
  removeDrink.mockReset()
  fetchHydration.mockResolvedValue(day())
})

describe('the frame', () => {
  it('names the module and the screen', async () => {
    renderWithProviders(<DietHydration />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Nawodnienie' }))
      .toBeInTheDocument()
    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
  })

  it('leads back to the module rather than out of it', async () => {
    renderWithProviders(<DietHydration />)

    const back = await screen.findByRole('link', { name: '← Wróć do strony głównej' })

    expect(back).toHaveAttribute('href', ROUTES.diet)
  })

  it('says it is loading before the answer arrives', () => {
    renderWithProviders(<DietHydration />)

    expect(screen.getByText('Wczytywanie…')).toBeInTheDocument()
  })

  it('a failed load is said plainly and can be retried', async () => {
    fetchHydration.mockRejectedValueOnce(new Error('offline'))

    renderWithProviders(<DietHydration />)

    expect(await screen.findByText('Nie udało się wczytać nawodnienia.')).toBeInTheDocument()

    fetchHydration.mockResolvedValue(day())
    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('4')).toBeInTheDocument()
  })

  it('a failed load never looks like a day nobody drank on', async () => {
    fetchHydration.mockRejectedValueOnce(new Error('offline'))

    renderWithProviders(<DietHydration />)
    await screen.findByText('Nie udało się wczytać nawodnienia.')

    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByRole('button', { name: /Szklanka/ })).toBeNull()
  })
})

describe('today', () => {
  it('shows the count the server computed', async () => {
    renderWithProviders(<DietHydration />)

    expect(await screen.findByText('4')).toBeInTheDocument()
    expect(screen.getByText('z 6 szklanek')).toBeInTheDocument()
  })

  it('never spells the goal or the glass into the screen', async () => {
    /** A psychodietitian setting the goal per patient is the obvious next step;
     *  a screen holding its own "6" would then be showing the wrong one. */
    fetchHydration.mockResolvedValue(
      day({ targetGlasses: 8, glassMl: 200, bottleMl: 700, glasses: 5 }),
    )

    renderWithProviders(<DietHydration />)

    expect(await screen.findByText('z 8 szklanek')).toBeInTheDocument()
    expect(screen.getByText('cel: 8 szklanek')).toBeInTheDocument()
    expect(screen.getByText('200 ml')).toBeInTheDocument()
    expect(screen.getByText('700 ml')).toBeInTheDocument()
  })

  it('renders a fractional count with a Polish comma', async () => {
    /** 400 ml is 1,6 glasses. Rounding that up would report back more than was
     *  entered, on a figure a specialist may read. */
    fetchHydration.mockResolvedValue(day({ waterMl: 400, glasses: 1.6 }))

    renderWithProviders(<DietHydration />)

    expect(await screen.findByText('1,6')).toBeInTheDocument()
  })

  it('does not announce the bar twice', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('recording a serving', () => {
  it('a glass sends the amount the server named', async () => {
    renderWithProviders(<DietHydration />)
    recordDrink.mockResolvedValue(day({ waterMl: 1250, glasses: 5 }))

    await userEvent.click(await screen.findByRole('button', { name: /\+ Szklanka/ }))

    expect(recordDrink).toHaveBeenCalledWith(250, 'Woda')
  })

  it('a bottle sends its own', async () => {
    renderWithProviders(<DietHydration />)
    recordDrink.mockResolvedValue(day({ waterMl: 1500, glasses: 6 }))

    await userEvent.click(await screen.findByRole('button', { name: /\+ Butelka/ }))

    expect(recordDrink).toHaveBeenCalledWith(500, 'Woda')
  })

  it('the screen redraws from the answer rather than adding a glass of its own', async () => {
    /** Three figures move when one glass is recorded. Patching them here is how
     *  one day would end up with two versions of itself. */
    renderWithProviders(<DietHydration />)
    recordDrink.mockResolvedValue(day({ waterMl: 1250, glasses: 5, progress: 0.833 }))

    await userEvent.click(await screen.findByRole('button', { name: /\+ Szklanka/ }))

    expect(await screen.findByText('5')).toBeInTheDocument()
  })

  it('a refusal is shown and the count does not move', async () => {
    renderWithProviders(<DietHydration />)
    recordDrink.mockRejectedValue(new ApiError(400, 'Na dziś zapisano już maksymalną liczbę porcji.'))

    await userEvent.click(await screen.findByRole('button', { name: /\+ Szklanka/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Na dziś zapisano już maksymalną liczbę porcji.',
    )
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})

describe('a custom amount', () => {
  it('is not on screen until it is asked for', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    expect(screen.queryByLabelText(/Ile wypiłaś/)).toBeNull()
  })

  it('sends what was typed', async () => {
    renderWithProviders(<DietHydration />)
    recordDrink.mockResolvedValue(day({ waterMl: 1400, glasses: 5.6 }))

    await userEvent.click(await screen.findByRole('button', { name: /Własna/ }))
    await userEvent.type(screen.getByLabelText(/Ile wypiłaś/), '400')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    expect(recordDrink).toHaveBeenCalledWith(400, 'Woda')
  })

  it('states its bounds rather than only enforcing them', async () => {
    /** A disabled button with no reason beside it is the failure the
     *  registration form had with `invitation_code`. */
    renderWithProviders(<DietHydration />)

    await userEvent.click(await screen.findByRole('button', { name: /Własna/ }))

    expect(screen.getByText('Od 10 do 2000 ml.')).toBeInTheDocument()
  })

  it('refuses an amount outside them before asking the server', async () => {
    renderWithProviders(<DietHydration />)

    await userEvent.click(await screen.findByRole('button', { name: /Własna/ }))
    await userEvent.type(screen.getByLabelText(/Ile wypiłaś/), '5000')

    expect(screen.getByRole('button', { name: 'Zapisz' })).toBeDisabled()
    expect(recordDrink).not.toHaveBeenCalled()
  })
})

describe('inne napoje', () => {
  it('offers the five the mockup draws', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    for (const drink of ['Herbata', 'Kawa', 'Napar ziołowy', 'Woda z cytryną', 'Kompot']) {
      expect(screen.getByRole('button', { name: drink })).toBeInTheDocument()
    }
  })

  it('records a serving with no amount at all', async () => {
    renderWithProviders(<DietHydration />)
    recordDrink.mockResolvedValue(day())

    await userEvent.click(await screen.findByRole('button', { name: 'Herbata' }))

    expect(recordDrink).toHaveBeenCalledWith(null, 'Herbata')
  })

  it('says out loud that they are not counted as water', async () => {
    /** Otherwise a counter that does not move after a tap reads as a bug. */
    renderWithProviders(<DietHydration />)

    expect(
      await screen.findByText(/nie przeliczamy na wodę/),
    ).toBeInTheDocument()
  })
})

describe('today\'s entries', () => {
  it('lists what was recorded, with the hour', async () => {
    fetchHydration.mockResolvedValue(
      day({
        entries: [
          { id: 'a', drink: 'Woda', amountMl: 250, at: '2026-09-11T14:20:00+02:00' },
          { id: 'b', drink: 'Herbata', amountMl: null, at: '2026-09-11T09:05:00+02:00' },
        ],
      }),
    )

    renderWithProviders(<DietHydration />)

    // Twice each: once in the row, once inside the remove button's
    // visually-hidden name, so "Usuń" is not the whole thing a screen reader
    // hears three times over.
    expect(await screen.findAllByText(/Szklanka · 250 ml/)).toHaveLength(2)
    expect(screen.getAllByText(/Herbata/)).not.toHaveLength(0)
    expect(screen.getByText(/14:20/)).toBeInTheDocument()
  })

  it('lets one be taken back and re-reads the day', async () => {
    /** A "+1" with no undo is a counter a stray tap on a phone cannot correct. */
    fetchHydration.mockResolvedValue(
      day({ entries: [{ id: 'a', drink: 'Woda', amountMl: 250, at: null }] }),
    )
    removeDrink.mockResolvedValue(undefined)

    renderWithProviders(<DietHydration />)
    await userEvent.click(await screen.findByRole('button', { name: /Usuń/ }))

    expect(removeDrink).toHaveBeenCalledWith('a')
    await waitFor(() => expect(fetchHydration).toHaveBeenCalledTimes(2))
  })

  it('an empty day says so rather than rendering nothing', async () => {
    renderWithProviders(<DietHydration />)

    expect(
      await screen.findByText(/Jeszcze nic dziś nie zapisałaś/),
    ).toBeInTheDocument()
  })
})

describe('the last seven days', () => {
  it('says every day in words, not only in bars', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    // The visually-hidden list is what a screen reader gets; seven bars are a
    // shape and this is the same information said properly.
    expect(screen.getByText(/czwartek, 10 września: 7 szklanek/)).toBeInTheDocument()
    expect(screen.getByText(/wtorek, 8 września: 6 szklanek/)).toBeInTheDocument()
  })

  it('a day nobody drank on is a zero rather than a gap', async () => {
    renderWithProviders(<DietHydration />)

    expect(await screen.findByText(/środa, 9 września: 0 szklanek/)).toBeInTheDocument()
  })
})

describe('what the screen must not say', () => {
  it('never congratulates and never counts a streak', async () => {
    /** "Po przekroczeniu celu pasek po prostu jest pełny. Nie ma gratulacji,
     *  serii ani komunikatu o niedoborze." (mockups §08) */
    fetchHydration.mockResolvedValue(day({ waterMl: 2500, glasses: 10, progress: 1 }))

    renderWithProviders(<DietHydration />)
    await screen.findByText('10')

    expect(screen.queryByText(/brawo|gratul|świetnie|cel osiągni|z rzędu|seria/i)).toBeNull()
  })

  it('and never says a day fell short', async () => {
    fetchHydration.mockResolvedValue(day({ waterMl: 0, glasses: 0, progress: 0 }))

    renderWithProviders(<DietHydration />)
    await screen.findByText('0')

    expect(screen.queryByText(/za mało|niedobór|powinnaś|powinieneś|wypij/i)).toBeNull()
  })

  it('shows the day over the goal as what it was', async () => {
    fetchHydration.mockResolvedValue(day({ waterMl: 2500, glasses: 10, progress: 1 }))

    renderWithProviders(<DietHydration />)

    expect(await screen.findByText('10')).toBeInTheDocument()
  })

  it('promises no suplementy, whose half of §08 is a screen of its own', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    expect(screen.queryByText(/suplement|lek[iów]|przypomnien/i)).toBeNull()
  })
})
