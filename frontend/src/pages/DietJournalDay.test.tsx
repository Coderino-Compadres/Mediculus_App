import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietJournalDay from './DietJournalDay'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import { toIsoDate } from '../utils/days'
import type { DietJournalDay as DietDayRecord } from '../types/diet'

/**
 * "Dzienniczek dnia" — one day of §07's history, opened out.
 *
 * Three groups of properties carry this file. It is **read-only**, including
 * for today, which is edited on the module's home screen — and it says which
 * of the two the reader is looking at. A day holding nothing is an **answer,
 * not a failure**, so it must not be drawn as an error with a retry. And
 * nothing here measures or judges a meal: this is the one screen that shows a
 * single day at full length, which makes it where somebody would add a daily
 * total.
 */

const fetchDietJournalDay = vi.fn<(date: string) => Promise<DietDayRecord>>()
vi.mock('../api/diet', () => ({
  fetchDietJournalDay: (date: string) => fetchDietJournalDay(date),
}))

let params: { date?: string } = {}
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => params,
}))

const PAST = '2026-09-08'

function meal(overrides: Partial<DietDayRecord['meals'][number]> = {}) {
  return {
    id: 'm1',
    kind: 'Obiad' as string | null,
    time: '13:30' as string | null,
    description: 'Zupa i kanapka, przy biurku.',
    ...overrides,
  }
}

function day(overrides: Partial<DietDayRecord> = {}): DietDayRecord {
  return { date: PAST, meals: [meal()], ...overrides }
}

async function renderDay(date = PAST, answer: DietDayRecord | null = null) {
  params = { date }
  fetchDietJournalDay.mockResolvedValue(answer ?? day({ date }))
  renderWithProviders(<DietJournalDay />)
  await waitFor(() =>
    expect(screen.queryByText('Wczytywanie dzienniczka…')).toBeNull(),
  )
}

beforeEach(() => {
  params = {}
  fetchDietJournalDay.mockReset()
})

describe('the day it was asked for', () => {
  it('asks the server for that date and nothing else', async () => {
    await renderDay(PAST)

    expect(fetchDietJournalDay).toHaveBeenCalledWith(PAST)
    expect(fetchDietJournalDay).toHaveBeenCalledTimes(1)
  })

  it('names the day in the heading, with the month lowercase', async () => {
    await renderDay(PAST)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/wtorek, 8 września/i)
    expect(heading).not.toHaveTextContent(/Września/)
  })

  it('says how many meals the day holds, declined in Polish', async () => {
    await renderDay(PAST, day({ meals: [meal(), meal({ id: 'm2' })] }))

    expect(screen.getByText('2 posiłki')).toBeInTheDocument()
  })

  it('lists them with the mockups\' own label', async () => {
    await renderDay(PAST)

    expect(screen.getByText('Obiad · 13:30')).toBeInTheDocument()
    expect(screen.getByText('Zupa i kanapka, przy biurku.')).toBeInTheDocument()
  })

  it('renders a meal that answered nothing as an ordinary row', async () => {
    /** §05: no field blocks a save, so this is a legitimate entry rather than
     *  something that failed to load. */
    await renderDay(PAST, day({
      meals: [meal({ kind: null, time: null, description: '' })],
    }))

    expect(screen.getByText('Zapisany bez opisu.')).toBeInTheDocument()
    expect(screen.queryByText(/nieznany/i)).toBeNull()
  })

  it('leads back to the list', async () => {
    await renderDay(PAST)

    expect(
      screen.getByRole('link', { name: /Wróć do dzienniczków/i }),
    ).toHaveAttribute('href', ROUTES.dietJournals)
  })
})

describe('what may be changed here, and where', () => {
  it('a past day is marked read-only and says why', async () => {
    await renderDay(PAST)

    expect(screen.getByText('Tylko odczyt')).toBeInTheDocument()
    expect(screen.getByText(/poprawiać można wyłącznie dzisiejsze/i))
      .toBeInTheDocument()
  })

  it('offers no way to change a past day', async () => {
    await renderDay(PAST)

    expect(screen.queryByRole('button', { name: /Usuń|Edytuj/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Edytuj/ })).toBeNull()
  })

  it('today is not editable here either, and it says where it is', async () => {
    /** A second place to correct a meal would be a second set of rules about
     *  correcting one. Today's meals are on the home screen with their own
     *  controls, so this screen points at it rather than growing its own. */
    const today = toIsoDate(new Date())
    await renderDay(today, day({ date: today }))

    expect(screen.getByText(/To dzisiejszy dzienniczek/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /poprawisz na stronie głównej/i }),
    ).toHaveAttribute('href', ROUTES.diet)
    expect(screen.queryByText('Tylko odczyt')).toBeNull()
  })
})

describe('a day with nothing in it', () => {
  it('is said as an absence rather than as a failure', async () => {
    /** The history lists exactly the days that hold a meal, so any other date
     *  names nothing — a typed URL, or a day emptied since the link was
     *  opened. */
    params = { date: '2026-01-01' }
    fetchDietJournalDay.mockRejectedValue(new ApiError(404, null))

    renderWithProviders(<DietJournalDay />)

    expect(await screen.findByText(/nie ma zapisanych posiłków/i))
      .toBeInTheDocument()
  })

  it('offers no retry, because a second attempt answers the same', async () => {
    params = { date: '2026-01-01' }
    fetchDietJournalDay.mockRejectedValue(new ApiError(404, null))

    renderWithProviders(<DietJournalDay />)
    await screen.findByText(/nie ma zapisanych posiłków/i)

    expect(screen.queryByRole('button', { name: /Spróbuj ponownie/i })).toBeNull()
  })

  it('does not say the diary is empty, only this day', async () => {
    params = { date: '2026-01-01' }
    fetchDietJournalDay.mockRejectedValue(new ApiError(404, null))

    renderWithProviders(<DietJournalDay />)
    await screen.findByText(/nie ma zapisanych posiłków/i)

    expect(screen.queryByText(/nie masz jeszcze/i)).toBeNull()
  })
})

describe('when the request fails for another reason', () => {
  it('shows the server\'s own sentence, which is a gate when there is one', async () => {
    /** Every refusal a patient can actually reach here is a gate — an
     *  unlinked minor, withdrawn consents — and each arrives saying what to
     *  do about it. */
    params = { date: PAST }
    fetchDietJournalDay.mockRejectedValue(
      new ApiError(403, 'Najpierw udziel zgód.'),
    )

    renderWithProviders(<DietJournalDay />)

    expect(await screen.findByText('Najpierw udziel zgód.')).toBeInTheDocument()
  })

  it('is never drawn as an empty day, and can be retried', async () => {
    params = { date: PAST }
    fetchDietJournalDay.mockRejectedValueOnce(new Error('offline'))

    renderWithProviders(<DietJournalDay />)
    await screen.findByText(/Nie udało się wczytać dzienniczka/)

    expect(screen.queryByText(/nie ma zapisanych posiłków/i)).toBeNull()

    fetchDietJournalDay.mockResolvedValue(day())
    await userEvent.click(screen.getByRole('button', { name: /Spróbuj ponownie/i }))

    expect(await screen.findByText('Obiad · 13:30')).toBeInTheDocument()
  })
})

describe('what this screen refuses to show', () => {
  it('counts, weighs and scores nothing', async () => {
    /** The one screen showing a single day at full length, which makes it
     *  where a daily total would be added. §04 states the scope. */
    await renderDay(PAST, day({
      meals: [meal(), meal({ id: 'm2', kind: 'Kolacja', time: '19:00' })],
    }))

    for (const forbidden of [
      /kcal/i, /kalor/i, /gram/i, /porcj/i, /waga/i, /białk/i, /w[ęe]glowod/i,
      /razem/i, /suma/i, /bilans/i, /cel dnia/i, /brakuje/i, /za du[żz]o/i,
      /gratul/i,
    ]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('promises no photo, which the module does not store', async () => {
    await renderDay(PAST)

    expect(screen.queryByText(/zdj[ęe]ci/i)).toBeNull()
    expect(within(document.body).queryAllByRole('img')).toEqual([])
  })
})
