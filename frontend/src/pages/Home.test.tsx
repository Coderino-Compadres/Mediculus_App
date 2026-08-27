import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import Home from './Home'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import { EMOTION_COLORS } from '../utils/emotions'
import type { DayMood, HomeDashboard } from '../types/dashboard'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../api/dashboard', () => ({ fetchHomeDashboard: vi.fn() }))
const { fetchHomeDashboard } = await import('../api/dashboard')
const mockedFetch = vi.mocked(fetchHomeDashboard)

function day(overrides: Partial<DayMood> = {}): DayMood {
  return {
    date: '2026-08-20',
    dayLabel: 'Czw',
    hasEntry: false,
    dominantEmotion: null,
    intensity: null,
    ...overrides,
  }
}

/** Seven days, oldest first, as the API always sends them. */
function week(overrides: Partial<DayMood>[] = []): DayMood[] {
  return Array.from({ length: 7 }, (_, index) =>
    day({ date: `2026-08-${20 + index}`, dayLabel: `D${index}`, ...(overrides[index] ?? {}) }),
  )
}

function dashboard(overrides: Partial<HomeDashboard> = {}): HomeDashboard {
  return {
    streakDays: 3,
    todayEntry: null,
    week: week(),
    averageStress: 4,
    averageEnergy: 6,
    technique: null,
    ...overrides,
  }
}

async function renderScreen(data: HomeDashboard | null = dashboard(), user = TEST_USER) {
  if (data) mockedFetch.mockResolvedValue(data)
  const result = renderWithProviders(<Home />, { user, route: ROUTES.home })
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  return result
}

function bars() {
  return Array.from(document.querySelectorAll('.mood-chart-bar')) as HTMLElement[]
}

beforeEach(() => {
  navigate.mockReset()
  mockedFetch.mockReset()
})

describe('Home — before the data arrives', () => {
  it('says it is loading rather than drawing an empty diary', async () => {
    mockedFetch.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<Home />, { user: TEST_USER, route: ROUTES.home })

    expect(screen.getByRole('status')).toHaveTextContent(/wczytywanie/i)
    expect(screen.queryByText(/dni z rzędu/i)).not.toBeInTheDocument()
  })

  it('greets the user by name straight away, before any request finishes', () => {
    mockedFetch.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<Home />, { user: TEST_USER, route: ROUTES.home })

    expect(screen.getByText(/dzień dobry, test/i)).toBeInTheDocument()
  })

  it('greets an account with no first name without a dangling comma', () => {
    mockedFetch.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<Home />, {
      user: { ...TEST_USER, firstName: null }, route: ROUTES.home,
    })

    expect(screen.getByText('Dzień dobry')).toBeInTheDocument()
  })

  it('asks the server exactly once per mount', async () => {
    await renderScreen()

    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('shows the disclaimer whatever else happens', async () => {
    await renderScreen()

    expect(screen.getByText(/nie zastępuje pomocy specjalisty/i)).toBeInTheDocument()
  })
})

describe('Home — today’s entry', () => {
  it('offers to start one when the day is still blank', async () => {
    await renderScreen(dashboard({ todayEntry: null }))

    expect(screen.getByText(/jeszcze pusty/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dodaj wpis/i })).toBeInTheDocument()
  })

  it('takes the patient to the form from the empty card', async () => {
    await renderScreen(dashboard({ todayEntry: null }))

    await userEvent.click(screen.getByRole('button', { name: /dodaj wpis/i }))

    expect(navigate).toHaveBeenCalledWith(ROUTES.diaryEntry)
  })

  it('summarises a saved entry as mood and rated emotions', async () => {
    await renderScreen(dashboard({
      todayEntry: {
        moodLabel: 'Neutralnie',
        emotions: [
          { emotion: 'Lęk', intensity: 7 },
          { emotion: 'Stres', intensity: 6 },
        ],
      },
    }))

    expect(screen.getByText('Neutralnie — Lęk 7/10, Stres 6/10')).toBeInTheDocument()
    expect(screen.getByText(/zapisany/i)).toBeInTheDocument()
  })

  it('names an emotion that carries no intensity instead of inventing one', async () => {
    /** 'Spokój' and 'Wstyd' had no scale column before migration 0005, so an
     *  entry can legitimately name a feeling without saying how strong it was. */
    await renderScreen(dashboard({
      todayEntry: { moodLabel: null, emotions: [{ emotion: 'Spokój', intensity: null }] },
    }))

    expect(screen.getByText('Spokój')).toBeInTheDocument()
  })

  it('still says something for an entry that answered nothing at all', async () => {
    await renderScreen(dashboard({ todayEntry: { moodLabel: null, emotions: [] } }))

    expect(screen.getByText('Wpis zapisany.')).toBeInTheDocument()
    expect(screen.queryByText(/jeszcze pusty/i)).not.toBeInTheDocument()
  })

  it('offers to edit today rather than to add a second entry', async () => {
    await renderScreen(dashboard({
      todayEntry: { moodLabel: 'Dobrze', emotions: [] },
    }))

    expect(screen.getByRole('button', { name: /edytuj/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dodaj wpis/i })).not.toBeInTheDocument()
  })
})

describe('Home — the seven-day chart', () => {
  it('draws one bar per day of the window', async () => {
    await renderScreen()

    expect(bars()).toHaveLength(7)
  })

  it('colours a day by the emotion that dominated it', async () => {
    await renderScreen(dashboard({
      week: week([{ hasEntry: true, dominantEmotion: 'Lęk', intensity: 8 }]),
    }))

    expect(bars()[0]).toHaveStyle({ backgroundColor: EMOTION_COLORS['Lęk'] })
  })

  it('gives a rated day a height proportional to the rating', async () => {
    await renderScreen(dashboard({
      week: week([{ hasEntry: true, dominantEmotion: 'Radość', intensity: 7 }]),
    }))

    expect(bars()[0]).toHaveStyle({ height: '70%' })
  })

  it('keeps a calm logged day visible rather than flat', async () => {
    /** A 0 is an answer — "not at all" — and must not look like silence. */
    await renderScreen(dashboard({
      week: week([{ hasEntry: true, dominantEmotion: 'Spokój', intensity: 0 }]),
    }))

    const height = Number.parseFloat(bars()[0].style.height)
    expect(height).toBeGreaterThan(0)
  })

  it('draws a day written without a rating at a fixed height, not at zero', async () => {
    await renderScreen(dashboard({
      week: week([{ hasEntry: true, dominantEmotion: 'Wstyd', intensity: null }]),
    }))

    expect(bars()[0]).toHaveStyle({ height: '20%' })
  })

  it('keeps a day with no entry lower than any day that has one', async () => {
    await renderScreen(dashboard({
      week: week([
        { hasEntry: false },
        { hasEntry: true, dominantEmotion: 'Spokój', intensity: 0 },
      ]),
    }))

    const [empty, written] = bars().map((bar) => Number.parseFloat(bar.style.height))
    expect(empty).toBeLessThan(written)
  })

  it('marks an entry whose emotion is outside the ten as "other" rather than blank', async () => {
    /** core/dashboard.py sends null for an unmappable name (the seed data has
     *  'zmęczenie'); a colourless bar would look like a day nobody wrote. */
    await renderScreen(dashboard({
      week: week([{ hasEntry: true, dominantEmotion: null, intensity: null }]),
    }))

    expect(screen.getByText('Inna emocja')).toBeInTheDocument()
  })

  it('explains each bar in words for anyone who cannot read colour', async () => {
    await renderScreen(dashboard({
      week: week([
        { hasEntry: false, dayLabel: 'Pon' },
        { hasEntry: true, dominantEmotion: null, dayLabel: 'Wt' },
        { hasEntry: true, dominantEmotion: 'Wstyd', intensity: null, dayLabel: 'Śr' },
        { hasEntry: true, dominantEmotion: 'Lęk', intensity: 9, dayLabel: 'Czw' },
      ]),
    }))

    const titles = bars().map((bar) => bar.getAttribute('title'))
    expect(titles[0]).toBe('Pon: brak wpisu')
    expect(titles[1]).toBe('Wt: wpis bez oceny nastroju')
    expect(titles[2]).toBe('Śr: Wstyd, bez oceny natężenia')
    expect(titles[3]).toBe('Czw: Lęk 9/10')
  })

  it('lists each emotion in the legend once, however many days used it', async () => {
    await renderScreen(dashboard({
      week: week([
        { hasEntry: true, dominantEmotion: 'Lęk', intensity: 5 },
        { hasEntry: true, dominantEmotion: 'Lęk', intensity: 7 },
        { hasEntry: true, dominantEmotion: 'Radość', intensity: 6 },
      ]),
    }))

    const legend = document.querySelector('.mood-chart-legend') as HTMLElement
    expect(within(legend).getAllByText('Lęk')).toHaveLength(1)
    expect(within(legend).getByText('Radość')).toBeInTheDocument()
  })

  it('does not offer an "other" key when every entry named a known emotion', async () => {
    await renderScreen(dashboard({
      week: week([{ hasEntry: true, dominantEmotion: 'Lęk', intensity: 5 }]),
    }))

    expect(screen.queryByText('Inna emocja')).not.toBeInTheDocument()
  })

  it('links on to the fuller analysis', async () => {
    await renderScreen()

    expect(screen.getByRole('link', { name: /analiza/i })).toHaveAttribute('href', ROUTES.analysis)
  })
})

describe('Home — the two averages', () => {
  it('writes a score with a Polish decimal comma', async () => {
    await renderScreen(dashboard({ averageStress: 4.25, averageEnergy: 6 }))

    expect(screen.getByText('4,3/10')).toBeInTheDocument()
    expect(screen.getByText('6,0/10')).toBeInTheDocument()
  })

  it('shows a dash rather than a zero when the week rated nothing', async () => {
    /** Zero would be a claim about the patient; a dash is the truth. */
    await renderScreen(dashboard({ averageStress: null, averageEnergy: null }))

    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows the streak the backend counted', async () => {
    await renderScreen(dashboard({ streakDays: 12 }))

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/dni z rzędu/i)).toBeInTheDocument()
  })
})

describe('Home — the crisis banner (US-PT-13)', () => {
  it('appears once average stress reaches the threshold', async () => {
    await renderScreen(dashboard({ averageStress: 6 }))

    expect(screen.getByText(/ostatnio jest Ci trudniej/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /plan bezpieczeństwa/i }))
      .toHaveAttribute('href', ROUTES.safetyPlan)
  })

  it('stays away just below the threshold', async () => {
    await renderScreen(dashboard({ averageStress: 5.9 }))

    expect(screen.queryByText(/ostatnio jest Ci trudniej/i)).not.toBeInTheDocument()
  })

  it('stays away when the week has no stress rating at all', async () => {
    await renderScreen(dashboard({ averageStress: null }))

    expect(screen.queryByText(/ostatnio jest Ci trudniej/i)).not.toBeInTheDocument()
  })

  it('offers no phone number while there is no real one to offer', async () => {
    /** Showing a placeholder number to someone in crisis is worse than showing
     *  none — see the TODO on CRISIS_SUPPORT_PHONE. */
    await renderScreen(dashboard({ averageStress: 8 }))

    expect(screen.getByText(/możesz przejść do swojego planu bezpieczeństwa/i))
      .toBeInTheDocument()
    expect(screen.queryByText(/numer wsparcia/i)).not.toBeInTheDocument()
  })

  it('marks the stress card itself, so the banner and the number agree', async () => {
    await renderScreen(dashboard({ averageStress: 7 }))

    expect(document.querySelector('.home-stat-card-alert')).toBeInTheDocument()
  })
})

describe('Home — the technique suggestion', () => {
  it('shows nothing when no report has proposed one', async () => {
    /** The judgement belongs to whatever produces the reports; the dashboard
     *  inventing a second opinion would quietly contradict it. */
    await renderScreen(dashboard({ technique: null }))

    expect(screen.queryByText(/propozycja na dziś/i)).not.toBeInTheDocument()
  })

  it('shows the technique and why it was matched', async () => {
    await renderScreen(dashboard({
      technique: { name: 'Uważność', matchReason: 'Twój stres rósł w tym tygodniu.' },
    }))

    expect(screen.getByText(/propozycja na dziś: uważność/i)).toBeInTheDocument()
    expect(screen.getByText('Twój stres rósł w tym tygodniu.')).toBeInTheDocument()
  })
})

describe('Home — when the data does not arrive', () => {
  it('never lets a failed load look like an empty diary', async () => {
    mockedFetch.mockRejectedValue(new ApiError(0, 'Nie udało się połączyć z serwerem.'))
    await renderScreen(null)

    expect(await screen.findByRole('alert')).toHaveTextContent(/nie udało się połączyć/i)
    expect(screen.queryByText(/jeszcze pusty/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/dni z rzędu/i)).not.toBeInTheDocument()
  })

  it('offers a retry for a failure that might not repeat', async () => {
    mockedFetch.mockRejectedValue(new ApiError(500, null))
    await renderScreen(null)

    expect(await screen.findByRole('button', { name: /spróbuj ponownie/i })).toBeInTheDocument()
  })

  it('does not offer a retry for a refusal that certainly will repeat', async () => {
    /** 403 is "this account has no patient row" — a guardian or a specialist.
     *  Asking again cannot change the answer. */
    mockedFetch.mockRejectedValue(
      new ApiError(403, 'Panel pacjenta jest dostępny tylko dla konta pacjenta.'),
    )
    await renderScreen(null)

    expect(await screen.findByRole('alert'))
      .toHaveTextContent(/tylko dla konta pacjenta/i)
    expect(screen.queryByRole('button', { name: /spróbuj ponownie/i })).not.toBeInTheDocument()
  })

  it('asks again when the retry is used, and draws what comes back', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, null))
    mockedFetch.mockResolvedValueOnce(dashboard({ streakDays: 4 }))
    await renderScreen(null)

    await userEvent.click(await screen.findByRole('button', { name: /spróbuj ponownie/i }))

    expect(await screen.findByText('4')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockedFetch).toHaveBeenCalledTimes(2)
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    mockedFetch.mockRejectedValue(new ApiError(500, null))
    await renderScreen(null)

    expect(await screen.findByRole('alert'))
      .toHaveTextContent(/nie udało się wczytać twoich danych/i)
  })

  it('still greets the user and still shows the disclaimer', async () => {
    mockedFetch.mockRejectedValue(new ApiError(500, null))
    await renderScreen(null)

    await screen.findByRole('alert')
    expect(screen.getByText(/dzień dobry, test/i)).toBeInTheDocument()
    expect(screen.getByText(/nie zastępuje pomocy specjalisty/i)).toBeInTheDocument()
  })
})
