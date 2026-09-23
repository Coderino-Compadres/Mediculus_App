import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { PAGE_SIZE } from '../hooks/usePagination'
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
    maxDrinkName: 40,
    liquidMl: 1000,
    glasses: 4,
    progress: 0.667,
    entries: [],
    week: [
      { date: '2026-09-05', liquidMl: 1000, glasses: 4 },
      { date: '2026-09-06', liquidMl: 1250, glasses: 5 },
      { date: '2026-09-07', liquidMl: 750, glasses: 3 },
      { date: '2026-09-08', liquidMl: 1500, glasses: 6 },
      { date: '2026-09-09', liquidMl: 0, glasses: 0 },
      { date: '2026-09-10', liquidMl: 1750, glasses: 7 },
      { date: '2026-09-11', liquidMl: 1000, glasses: 4 },
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

  it('says the server\'s own reason when it gave one', async () => {
    /** The same argument as on the supplements screen: every refusal reachable
     *  here is a gate rather than a fault, and each arrives with a sentence
     *  saying what to do about it. "Nie udało się wczytać nawodnienia" would
     *  describe a failure that did not happen. */
    fetchHydration.mockRejectedValueOnce(
      new ApiError(403, 'To konto czeka na akceptację opiekuna.'),
    )

    renderWithProviders(<DietHydration />)

    expect(await screen.findByText('To konto czeka na akceptację opiekuna.'))
      .toBeInTheDocument()
    expect(screen.queryByText('Nie udało się wczytać nawodnienia.')).toBeNull()
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
    fetchHydration.mockResolvedValue(day({ liquidMl: 400, glasses: 1.6 }))

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
    recordDrink.mockResolvedValue(day({ liquidMl: 1250, glasses: 5 }))

    await userEvent.click(await screen.findByRole('button', { name: /\+ Szklanka/ }))

    expect(recordDrink).toHaveBeenCalledWith(250, 'Woda')
  })

  it('a bottle sends its own', async () => {
    renderWithProviders(<DietHydration />)
    recordDrink.mockResolvedValue(day({ liquidMl: 1500, glasses: 6 }))

    await userEvent.click(await screen.findByRole('button', { name: /\+ Butelka/ }))

    expect(recordDrink).toHaveBeenCalledWith(500, 'Woda')
  })

  it('the screen redraws from the answer rather than adding a glass of its own', async () => {
    /** Three figures move when one glass is recorded. Patching them here is how
     *  one day would end up with two versions of itself. */
    renderWithProviders(<DietHydration />)
    recordDrink.mockResolvedValue(day({ liquidMl: 1250, glasses: 5, progress: 0.833 }))

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
    recordDrink.mockResolvedValue(day({ liquidMl: 1400, glasses: 5.6 }))

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

  it('lets them move the counter, because every drink counts now', async () => {
    /**
     * THE RULE TURNED ROUND ON 2026-09-17. A tea used to be recorded and left
     * out of the figure ("nie przeliczane na wodę", §08); it counts at its own
     * volume now, and `core/hydration.py` carries the client's reversal.
     *
     * THE ASSERTION IS ON THE ANSWER, NOT ON ARITHMETIC HERE. The screen adds
     * nothing up — the server sends the day back and the screen draws it — so
     * what this pins is that a serving is sent with its own name and that the
     * count the answer carries is the count on screen. The previous version of
     * this test asserted the figure was *unchanged* while mocking a response in
     * which it was unchanged, so it would have passed either way.
     *
     * THE NOTE ABOVE THE CHIPS IS STILL GONE. It said "nie przeliczamy na
     * wodę", was reworded to the opposite claim and then removed outright in
     * 02659e6; the reversal makes the second wording the true one, but whether
     * the card says anything at all is still the klientka's call.
     */
    recordDrink.mockResolvedValue(day({ liquidMl: 1250, glasses: 5, progress: 0.833 }))
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: 'Herbata' }))

    expect(recordDrink).toHaveBeenCalledWith(null, 'Herbata')
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
  })
})

describe('millilitres for a drink that is not water', () => {
  const AMOUNT = /Ile\? \(ml, opcjonalnie\)/

  it('says that a tap with no amount is recorded as a glass', async () => {
    /**
     * THE SENTENCE THAT MAKES THE DEFAULT HONEST. A serving with no size given
     * is stored as 250 ml — a number nobody typed, entering a clinical record
     * and, on water, moving the goal bar. This project is otherwise careful not
     * to invent one (the diary's sliders wrote a 0 nobody chose, and that was a
     * defect). It holds only because the patient is told.
     *
     * If this test is ever deleted, `DEFAULT_SERVING_ML` has to go with it.
     */
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    /** THE SENTENCE IS GONE, THE DEFAULT IS NOT — removed in 02659e6 while
     *  `DEFAULT_SERVING_ML` stayed. So this asserts the half that can still be
     *  asserted from here: the field is genuinely optional, and a bare tap
     *  sends no amount, which is what lets the server apply the glass. The
     *  disclosure itself is now nowhere on the screen. */
    expect(screen.getByLabelText(AMOUNT)).toHaveValue(null)
    expect(screen.getByLabelText(AMOUNT)).not.toBeRequired()
  })

  it('is optional — a bare tap on a chip is still a serving', async () => {
    /** The card's original interaction has to survive the new field. The
     *  browser sends no amount and the *server* applies the glass, so the
     *  default has one definition rather than two. */
    recordDrink.mockResolvedValue(day())
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: 'Herbata' }))

    expect(recordDrink).toHaveBeenCalledWith(null, 'Herbata')
  })

  it('sends the amount typed beside the chips', async () => {
    recordDrink.mockResolvedValue(day())
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.type(screen.getByLabelText(AMOUNT), '300')
    await userEvent.click(screen.getByRole('button', { name: 'Kawa' }))

    expect(recordDrink).toHaveBeenCalledWith(300, 'Kawa')
  })

  it('sends it for a typed drink too', async () => {
    recordDrink.mockResolvedValue(day())
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.type(screen.getByLabelText(AMOUNT), '250')
    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))
    await userEvent.type(screen.getByLabelText(/Co piłaś lub piłeś/), 'Lemoniada')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(recordDrink).toHaveBeenCalled())
    expect(recordDrink).toHaveBeenCalledWith(250, 'Lemoniada')
  })

  it('empties itself after a serving, so it cannot ride along on the next tap', async () => {
    /**
     * The defect this field would otherwise have: 300 ml typed for a coffee,
     * then a tap on "Herbata" an hour later silently recording 300 ml again.
     * That is the sort of thing somebody finds in their own records a week
     * later and cannot explain.
     */
    recordDrink.mockResolvedValue(day())
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.type(screen.getByLabelText(AMOUNT), '300')
    await userEvent.click(screen.getByRole('button', { name: 'Kawa' }))
    await waitFor(() => expect(screen.getByLabelText(AMOUNT)).toHaveValue(null))

    await userEvent.click(screen.getByRole('button', { name: 'Herbata' }))

    expect(recordDrink).toHaveBeenLastCalledWith(null, 'Herbata')
  })

  it('refuses to send a number outside the bounds, and says why', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.type(screen.getByLabelText(AMOUNT), '9000')

    /** The bounds are enforced and, since 02659e6, no longer stated: the hint
     *  that spelled them out was emptied. The refusal is still marked on the
     *  field itself, which is the part a reader can act on. */
    expect(screen.getByRole('button', { name: 'Herbata' })).toBeDisabled()
    expect(screen.getByLabelText(AMOUNT)).toHaveAttribute('aria-invalid', 'true')
    expect(recordDrink).not.toHaveBeenCalled()
  })

  it('reads its bounds off the payload rather than spelling them in', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    const input = screen.getByLabelText(AMOUNT)
    expect(input).toHaveAttribute('min', '10')
    expect(input).toHaveAttribute('max', '2000')
  })

  it('sends a measured drink under its own name, never as water', async () => {
    /** More important now, not less: a number next to a drink invites exactly
     *  the assumption the client ruled out, and the sentence that ruled it out
     *  is no longer on the card (see the note on the chips above). */
    recordDrink.mockResolvedValue(day())
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.type(screen.getByLabelText(AMOUNT), '300')
    await userEvent.click(screen.getByRole('button', { name: 'Herbata' }))

    expect(recordDrink).toHaveBeenCalledWith(300, 'Herbata')
  })

  it('lists a measured drink by its own name, never as a glass of water', async () => {
    /**
     * `entryLabel` used to reach "Szklanka · 250 ml" for anything carrying an
     * amount, which was safe only while nothing but water could carry one. A
     * 250 ml tea would have been listed as water on the one screen whose whole
     * rule is that it is not.
     */
    fetchHydration.mockResolvedValueOnce(
      day({
        entries: [
          { id: 'e1', drink: 'Herbata', amountMl: 250, at: '2026-09-09T10:00:00+02:00' },
        ],
      }),
    )
    renderWithProviders(<DietHydration />)

    // Two matches by design: the row's own label and the "Usuń" button's
    // accessible name, which quotes the entry it removes.
    expect(await screen.findAllByText(/Herbata · 250 ml/)).not.toHaveLength(0)
    // Scoped to the serving label: "+ Szklanka" is a button on the water
    // card above and is meant to be there.
    expect(screen.queryAllByText(/Szklanka · 250 ml/)).toHaveLength(0)
  })
})

describe('a drink the chips do not name', () => {
  it('is reachable from the chip row, and only once asked for', async () => {
    /* Not on §08's artboard — five chips is the commonest drinks rather than
       all of them. Behind a control, so the card stays a row of chips. */
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    expect(screen.queryByLabelText(/Co piłaś lub piłeś/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))

    expect(screen.getByLabelText(/Co piłaś lub piłeś/)).toBeInTheDocument()
  })

  it('records the typed name as a serving with no amount', async () => {
    /** The absent amount is what keeps it out of the water total, whatever it
     *  is called — the client's rule made structural rather than careful. */
    recordDrink.mockResolvedValue(day())
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))
    await userEvent.type(screen.getByLabelText(/Co piłaś lub piłeś/), 'Sok pomarańczowy')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(recordDrink).toHaveBeenCalled())
    expect(recordDrink).toHaveBeenCalledWith(null, 'Sok pomarańczowy')
  })

  it('normalises nothing itself — the name travels as typed', async () => {
    /* Folding "herbata" onto "Herbata" is the server's job; a second definition
       here is the drift the shared vocabularies are tested against. */
    recordDrink.mockResolvedValue(day())
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))
    await userEvent.type(screen.getByLabelText(/Co piłaś lub piłeś/), '  herbata  ')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(recordDrink).toHaveBeenCalled())
    expect(recordDrink).toHaveBeenCalledWith(null, 'herbata')
  })

  it('cannot be submitted empty', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))

    expect(screen.getByRole('button', { name: 'Zapisz' })).toBeDisabled()
  })

  it('caps the input at the length the server accepts', async () => {
    /* Read off the payload, not spelled into the markup — like the two amount
       bounds beside it. */
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))

    expect(screen.getByLabelText(/Co piłaś lub piłeś/)).toHaveAttribute('maxlength', '40')
  })

  it('shows a refusal about the name under the input that produced it', async () => {
    /**
     * The one refusal a patient can actually reach here is typing "woda", and
     * it has to land on the box they typed into: this form renders no amount
     * input, so answering under `amount_ml` would be a save failing somewhere
     * the eye is not — the failure `Register.tsx` had with `invitation_code`.
     */
    recordDrink.mockRejectedValue(
      new ApiError(400, null, { drink: 'Wodę zapisujesz przyciskami powyżej.' }),
    )
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))
    await userEvent.type(screen.getByLabelText(/Co piłaś lub piłeś/), 'woda')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Wodę zapisujesz przyciskami/)
    expect(screen.getByLabelText(/Co piłaś lub piłeś/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('asks for no amount at all', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    await userEvent.click(screen.getByRole('button', { name: '+ Inny napój' }))

    const input = screen.getByLabelText(/Co piłaś lub piłeś/)
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.queryByLabelText(/Ile wypiłaś lub wypiłeś/)).toBeNull()
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
    fetchHydration.mockResolvedValue(day({ liquidMl: 2500, glasses: 10, progress: 1 }))

    renderWithProviders(<DietHydration />)
    await screen.findByText('10')

    expect(screen.queryByText(/brawo|gratul|świetnie|cel osiągni|z rzędu|seria/i)).toBeNull()
  })

  it('and never says a day fell short', async () => {
    fetchHydration.mockResolvedValue(day({ liquidMl: 0, glasses: 0, progress: 0 }))

    renderWithProviders(<DietHydration />)
    await screen.findByText('0')

    expect(screen.queryByText(/za mało|niedobór|powinnaś|powinieneś|wypij/i)).toBeNull()
  })

  it('shows the day over the goal as what it was', async () => {
    fetchHydration.mockResolvedValue(day({ liquidMl: 2500, glasses: 10, progress: 1 }))

    renderWithProviders(<DietHydration />)

    expect(await screen.findByText('10')).toBeInTheDocument()
  })

  it('promises no suplementy, whose half of §08 is a screen of its own', async () => {
    renderWithProviders(<DietHydration />)
    await screen.findByText('4')

    expect(screen.queryByText(/suplement|lek[iów]|przypomnien/i)).toBeNull()
  })
})

describe("today's servings are paginated and the week is not", () => {
  /**
   * A readability measure and nothing more: `MAX_ENTRIES_PER_DAY` (40) is a
   * backstop rather than a product rule, so an ordinary day never reaches a
   * second page.
   *
   * "Ostatnie 7 dni" must never gain a control of its own — it is exactly seven
   * columns by definition, and there is one `?page=` to go round.
   */
  const servings = (count: number) =>
    // Newest first, as core/hydration.py orders them.
    Array.from({ length: count }, (_, index) => ({
      id: `e-${index}`,
      drink: 'Woda',
      amountMl: 250,
      at: `2026-09-11T${String(22 - index).padStart(2, '0')}:00:00+02:00`,
    }))

  it('draws no control over an ordinary day', async () => {
    fetchHydration.mockResolvedValue(day({ entries: servings(PAGE_SIZE) }))
    renderWithProviders(<DietHydration />)

    await screen.findByText('Dzisiejsze wpisy')
    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('shows seven servings on a page and counts them as wpisy', async () => {
    fetchHydration.mockResolvedValue(day({ entries: servings(20) }))
    renderWithProviders(<DietHydration />)

    expect(await screen.findByText(/Strona 1 z 3/)).toBeInTheDocument()
    expect(screen.getByText(/1–7 z 20 wpisów/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Usuń/ })).toHaveLength(PAGE_SIZE)
  })

  it('leaves the seven-day chart whole on every page', async () => {
    // It is seven columns by definition; a page control over it would be a
    // control that can only be pressed to no effect.
    fetchHydration.mockResolvedValue(day({ entries: servings(20) }))
    renderWithProviders(<DietHydration />)
    await screen.findByText(/Strona 1 z 3/)

    await userEvent.click(screen.getByRole('button', { name: /następna/i }))

    expect(screen.getByText(/Strona 2 z 3/)).toBeInTheDocument()
    // One nav, over the servings — not two.
    expect(screen.getAllByRole('navigation', { name: 'Paginacja' })).toHaveLength(1)
    expect(screen.getByText('Ostatnie 7 dni')).toBeInTheDocument()
  })

  it('goes back to page one when a serving is recorded, so it can be taken back', async () => {
    // The list is newest-first and the "Usuń" beside a serving is the whole
    // reason it is drawn: an undo must not be a page turn away from the tap
    // that needed it.
    fetchHydration.mockResolvedValue(day({ entries: servings(20) }))
    recordDrink.mockResolvedValue(day({ entries: servings(21) }))
    renderWithProviders(<DietHydration />)
    await screen.findByText(/Strona 1 z 3/)
    await userEvent.click(screen.getByRole('button', { name: /następna/i }))
    expect(screen.getByText(/Strona 2 z 3/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /\+ Szklanka/ }))

    await waitFor(() => expect(screen.getByText(/Strona 1 z 3/)).toBeInTheDocument())
  })

  it('still says nothing that is a verdict, on a paginated day', async () => {
    fetchHydration.mockResolvedValue(day({ entries: servings(20) }))
    renderWithProviders(<DietHydration />)
    await screen.findByText(/Strona 1 z 3/)

    for (const forbidden of [/gratul/i, /seria/i, /pod rząd/i, /brakuje/i, /za mało/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })
})
