import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import { PAGE_SIZE } from '../hooks/usePagination'
import DietActivitySleep from './DietActivitySleep'
import { nightLabel } from '../utils/sleep'
import { ROUTES } from '../routes'
import { toIsoDate } from '../utils/days'
import type { DietActivityDay, DietSleepNight } from '../types/diet'

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return {
    ...actual,
    loadActivityDay: vi.fn(actual.loadActivityDay),
    loadSleepNight: vi.fn(actual.loadSleepNight),
  }
})
const { emptyActivityDay, emptySleepNight, loadActivityDay, loadSleepNight, sampleActivityDay } =
  await import('../api/diet')
const mockedActivity = vi.mocked(loadActivityDay)
const mockedSleep = vi.mocked(loadSleepNight)

/**
 * "Aktywność i sen" — §09 of the diet mockups, both halves.
 *
 * WHAT IS PINNED HERE IS MOSTLY ABSENCE, the same as on the module's other two
 * screens and for the same reason: the premise is a diary that describes rather
 * than measures, so the defects are all additions. Calories, intensity, a daily
 * step target, a progress bar, a comparison with yesterday, a streak, a badge —
 * every one of those is something a reasonable person would add thinking it an
 * improvement, and every one of them is out of the module's scope. They are
 * tests rather than comments because a comment does not fail.
 *
 * THE SECOND THING PINNED IS THE LANGUAGE. The mockup is written throughout in
 * the feminine ("Co dzisiaj robiłaś?", "czułaś się", "Wyspana"), because it
 * describes one user's journey. The app has users of both genders and uses
 * either an impersonal form or both forms with "lub" — never a bare feminine
 * ending. The sweep at the bottom is what keeps a copy edit from reintroducing
 * one.
 *
 * The data source is stubbed rather than used as-is: the real loaders answer
 * with an empty day until the module has a backend, so without the stub the
 * filled-state markup would never render and half of these would pass vacuously.
 */

const TODAY = toIsoDate(new Date())

function activityDay(overrides: Partial<DietActivityDay> = {}): DietActivityDay {
  return { ...emptyActivityDay(), ...overrides }
}

function sleepNight(overrides: Partial<DietSleepNight> = {}): DietSleepNight {
  return { ...emptySleepNight(), ...overrides }
}

/** The switch is on the screen, so reaching the sleep half is a click. */
async function goToSleep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Sen' }))
}

/**
 * The panel a reader can actually see.
 *
 * Both panels are mounted now — that is what stops a tab switch throwing away
 * whatever was on the one being left — so the inactive one is in the DOM under
 * `hidden`. Role queries skip it on their own (`getByRole` excludes what is
 * hidden from the accessibility tree), but **text queries do not**: a bare
 * `getByText` for a string both panels use, such as the day-lock sentence or the
 * "Tylko odczyt" badge, matches twice. Scope those through here.
 *
 * It is also what keeps the language sweep at the bottom honest: `container
 * .textContent` now always holds both halves, so a sweep run over it would stop
 * being a statement about the half on screen.
 */
function visiblePanel(): HTMLElement {
  const panel = document.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')
  if (panel === null) throw new Error('żaden panel nie jest widoczny')
  return panel
}

beforeEach(() => {
  mockedActivity.mockImplementation(() => activityDay())
  mockedSleep.mockImplementation(() => sleepNight())
})

/** The day-lock cases move the clock; anything after them needs the real one
 *  back, or `TODAY` and the date labels stop agreeing with the system time. */
afterEach(() => {
  vi.useRealTimers()
})

describe('the screen itself', () => {
  it('names the module and the screen with §03\'s own title', () => {
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Aktywność i sen' })).toBeInTheDocument()
  })

  it('leads back to the module home, not to the psychotherapy one', () => {
    renderWithProviders(<DietActivitySleep />)

    expect(
      screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' }),
    ).toHaveAttribute('href', ROUTES.diet)
  })

  it('goes back through an arrow in the header, and it is a real link', () => {
    /**
     * Two things at once. The arrow is *in the header*, not a link below it —
     * the app had two different ways of going back depending on which module you
     * were in, which a patient crossing between them reads as two products, and
     * both mockup sets draw the arrow.
     *
     * And it is an `<a>`: the shape is what the modules share, the element
     * follows what the control does. pages/DiaryEntry.tsx is a button because it
     * runs an unsaved-changes guard first; this screen runs nothing, so a button
     * would drop middle-click, cmd-click and "copy link address" for nothing.
     */
    renderWithProviders(<DietActivitySleep />)

    const back = screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' })
    expect(back.tagName).toBe('A')
    expect(screen.getByRole('banner')).toContainElement(back)
  })

  it('says out loud that nothing here is stored yet', () => {
    /**
     * The screen is a form with two "Zapisz" buttons, a list headed "Zapisane
     * dzisiaj" and a day-lock notice promising the entry "zostanie zapisany na
     * stałe" — and there is no `/api/diet/activity/` or `/api/diet/sleep/`
     * behind any of it, so a reload loses everything. A patient writing down a
     * week of walks and finding them gone is the defect `0009` already was once
     * (told the entry had saved "pora dnia", dropped it silently), so the
     * screen has to admit it.
     *
     * Pinned on the consequence rather than on the sentence: reword it freely,
     * but a patient must still be told the entries do not survive a reload.
     * Delete this test in the commit that wires the endpoints.
     */
    const { container } = renderWithProviders(<DietActivitySleep />)

    expect(container.textContent).toMatch(/nie zapisuje/)
    expect(container.textContent).toMatch(/odświeżeniu/)
  })

  it('writes the day under the title, with a lowercase month', () => {
    const expected = new Date().toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByText(expected)).toBeInTheDocument()
    expect(expected).toMatch(/^[a-ząćęłńóśźż]/)
  })
})

describe('the segmented switch', () => {
  it('is one route with two halves, because the menu has one entry', async () => {
    renderWithProviders(<DietActivitySleep />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Aktywność', 'Sen'])
  })

  it('opens on "Aktywność"', () => {
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('tab', { name: 'Aktywność' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Sen' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('heading', { name: 'Aktywność dzisiaj' })).toBeInTheDocument()
  })

  it('switches on a click, and swaps the panel', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    expect(screen.getByRole('tab', { name: 'Sen' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Godziny' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Aktywność dzisiaj' })).toBeNull()
  })

  it('switches with the arrow keys, which is what claiming the role promises', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.tab()
    // The first tab stop inside the page content is the switch — one stop for
    // the group, then the arrows (roving tabindex).
    const active = screen.getByRole('tab', { name: 'Aktywność' })
    active.focus()
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Sen' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Aktywność' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('keeps one tab stop for the pair, not two', () => {
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('tab', { name: 'Aktywność' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Sen' })).toHaveAttribute('tabindex', '-1')
  })

  it('points each tab at a panel that is actually in the document', () => {
    // Only the active panel used to be rendered, with the *active* tab's id — so
    // the other tab's `aria-controls` dangled, and a screen-reader user asking
    // what it controls got nothing.
    renderWithProviders(<DietActivitySleep />)

    for (const tab of screen.getAllByRole('tab')) {
      const id = tab.getAttribute('aria-controls')
      expect(id).toBeTruthy()
      expect(document.getElementById(id as string)).not.toBeNull()
    }
  })

  it('keeps what is on a panel when you visit the other one and come back', async () => {
    /**
     * The panels were a ternary, so switching destroyed the one being left —
     * and nothing in this module persists anything, so that was not tidiness,
     * it was data loss. A patient who logged two activities and typed a step
     * count, then went to describe last night, came back to an empty list.
     */
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Spacer' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))
    await user.type(screen.getByLabelText('Liczba kroków'), '6400')

    await goToSleep(user)
    await user.click(screen.getByRole('tab', { name: 'Aktywność' }))

    expect(screen.getByLabelText('Liczba kroków')).toHaveValue('6400')
    expect(within(screen.getByRole('list')).getByText('Spacer')).toBeInTheDocument()
  })

  it('keeps a half-filled sleep form across the same trip', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)
    await user.click(screen.getByRole('button', { name: 'Jakość snu: 4 z 5' }))
    await user.click(screen.getByRole('tab', { name: 'Aktywność' }))
    await goToSleep(user)

    expect(screen.getByRole('button', { name: 'Jakość snu: 4 z 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('hides the inactive panel rather than leaving it readable', () => {
    // `hidden` is what keeps both panels alive without both being on screen —
    // and what takes the inactive one out of the accessibility tree.
    renderWithProviders(<DietActivitySleep />)

    expect(document.getElementById('diet-as-panel-activity')).not.toHaveAttribute('hidden')
    expect(document.getElementById('diet-as-panel-sleep')).toHaveAttribute('hidden')
  })

  it('names the night rather than the day once the sleep half is open', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    // A sleep entry spans two days and belongs to neither on its own, so the
    // subtitle cannot be "piątek".
    expect(screen.getByText(nightLabel(new Date()))).toBeInTheDocument()
    expect(screen.getByText(/^noc z/)).toBeInTheDocument()
  })
})

describe('the activity form', () => {
  it('offers the mockup\'s six kinds plus free text', () => {
    renderWithProviders(<DietActivitySleep />)

    for (const kind of ['Spacer', 'Rower', 'Joga', 'Basen', 'Siłownia', 'Taniec', 'Inne']) {
      expect(screen.getByRole('button', { name: kind })).toBeInTheDocument()
    }
  })

  it('takes one kind at a time, and lets the answer be taken back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Rower' }))
    expect(screen.getByRole('button', { name: 'Rower' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Joga' }))
    expect(screen.getByRole('button', { name: 'Rower' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Joga' })).toHaveAttribute('aria-pressed', 'true')

    // Pressing the chosen chip again clears it: nothing on this form is
    // required, so "I would rather not say" has to be reachable.
    await user.click(screen.getByRole('button', { name: 'Joga' }))
    expect(screen.getByRole('button', { name: 'Joga' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals the free-text field only when "Inne" is chosen', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    expect(screen.queryByLabelText('Jaka aktywność?')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Inne' }))
    expect(screen.getByLabelText('Jaka aktywność?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Inne' }))
    expect(screen.queryByLabelText('Jaka aktywność?')).toBeNull()
  })

  it('asks how the person felt after, in comparative terms', async () => {
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByText('Samopoczucie po')).toBeInTheDocument()
    for (const label of ['Gorsze', 'Neutralne', 'Lepsze']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // The mockup's "Dobre" grades the state instead of comparing it.
    expect(screen.queryByRole('button', { name: 'Dobre' })).toBeNull()
  })

  it('measures duration in minutes, in fives', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('status')).toHaveTextContent('30 min')

    await user.click(screen.getByRole('button', { name: 'Czas trwania: więcej' }))
    expect(screen.getByRole('status')).toHaveTextContent('35 min')
  })

  it('saves whatever was answered and nothing else', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Spacer' }))
    await user.click(screen.getByRole('button', { name: 'Czas trwania: więcej' }))
    await user.click(screen.getByRole('button', { name: 'Lepsze' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    const list = screen.getByRole('list')
    expect(within(list).getByText('Spacer · 35 min')).toBeInTheDocument()
    expect(within(list).getByText('Samopoczucie po: lepsze')).toBeInTheDocument()
  })

  it('shows the free text in the row, never the word "Inne"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Inne' }))
    await user.type(screen.getByLabelText('Jaka aktywność?'), 'Wspinaczka')
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    const list = screen.getByRole('list')
    expect(within(list).getByText(/Wspinaczka/)).toBeInTheDocument()
    expect(within(list).queryByText(/^Inne/)).toBeNull()
  })

  it('clears the form after a save, so the next entry starts empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Spacer' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    expect(screen.getByRole('button', { name: 'Spacer' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('status')).toHaveTextContent('30 min')
  })

  it('takes several activities in one day', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Spacer' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))
    await user.click(screen.getByRole('button', { name: 'Joga' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('lets an activity be saved with nothing filled in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    // The module's rule everywhere: no field blocks a save. An entry with only
    // an hour on it says so plainly rather than rendering as a blank row.
    expect(screen.getByText('Zapisana bez szczegółów.')).toBeInTheDocument()
  })

  /**
   * The edge the "untouched control is not an answer" rule leaves behind.
   *
   * The stepper renders 30, but an untouched stepper has not answered — the same
   * lesson pages/DiaryEntry.tsx learned when sliders starting at 0 wrote "no
   * energy, no tension" for every patient who only answered the mood tile. The
   * cost is that recording exactly 30 minutes takes moving the control off 30
   * and back, which is pinned rather than hidden.
   */
  it('does not record a duration nobody set', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Spacer' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    const list = screen.getByRole('list')
    expect(within(list).getByText('Spacer')).toBeInTheDocument()
    expect(within(list).queryByText(/min/)).toBeNull()
  })

  it('lets a duration be taken back, like every other answer on the form', async () => {
    /**
     * The chips deselect and the sleep scale deselects, but the stepper had no
     * way back to "unanswered": one accidental "+" recorded 35 min for good.
     */
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    expect(screen.queryByRole('button', { name: 'Nie podaję czasu' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Czas trwania: więcej' }))
    await user.click(screen.getByRole('button', { name: 'Nie podaję czasu' }))
    await user.click(screen.getByRole('button', { name: 'Spacer' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    const list = screen.getByRole('list')
    expect(within(list).getByText('Spacer')).toBeInTheDocument()
    expect(within(list).queryByText(/min/)).toBeNull()
  })

  it('will not run the duration past what a day can hold', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    const plus = screen.getByRole('button', { name: 'Czas trwania: więcej' })
    // 30 -> 1440 is 282 taps; a stuck finger gets there, and 40 hours of yoga
    // would then go into a document a specialist reads.
    for (let tap = 0; tap < 300; tap += 1) await user.click(plus)

    expect(screen.getByRole('status')).toHaveTextContent(`${24 * 60} min`)
    expect(plus).toHaveAttribute('aria-disabled', 'true')
  })

  it('records a deliberate 30 once the control has been moved off it and back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: 'Czas trwania: więcej' }))
    await user.click(screen.getByRole('button', { name: 'Czas trwania: mniej' }))
    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    expect(within(screen.getByRole('list')).getByText('30 min')).toBeInTheDocument()
  })
})

describe('the step count', () => {
  it('is one field, typed by hand, and says so', () => {
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('heading', { name: 'Kroki' })).toBeInTheDocument()
    expect(screen.getByLabelText('Liczba kroków')).toBeInTheDocument()
    expect(screen.getByText('Wpisujesz ręcznie, kiedy chcesz.')).toBeInTheDocument()
  })

  it('starts empty rather than at zero', () => {
    // Nobody having typed a count and somebody having taken no steps are
    // different claims, and only the first is one this screen can make.
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByLabelText('Liczba kroków')).toHaveValue('')
  })

  it('takes digits and ignores everything else', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    const field = screen.getByLabelText('Liczba kroków')
    await user.type(field, '6 400 kroków')
    expect(field).toHaveValue('6400')
  })

  it('carries no goal, no progress bar and no comparison', () => {
    const { container } = renderWithProviders(<DietActivitySleep />)

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(container.textContent).not.toMatch(/cel|wczoraj|gratul|brawo|rekord|z rzędu/i)
  })
})

describe('what the activity half refuses to show', () => {
  it('counts no calories', () => {
    const { container } = renderWithProviders(<DietActivitySleep />)

    expect(container.textContent).not.toMatch(/kalor|kcal|spalon/i)
  })

  it('asks about no intensity, effort or heart rate', () => {
    const { container } = renderWithProviders(<DietActivitySleep />)

    expect(container.textContent).not.toMatch(/intensyw|wysił|tętn|strefa|tempo/i)
  })

  it('offers no synchronisation with a watch or a health app', () => {
    const { container } = renderWithProviders(<DietActivitySleep />)

    expect(container.textContent).not.toMatch(/synchron|smartwatch|zegarek|krokomierz|Google Fit|Apple/i)
  })

  it('has an empty list that invites rather than judges', () => {
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('heading', { name: 'Zapisane dzisiaj' })).toBeInTheDocument()
    expect(screen.getByText(/Nic tu jeszcze nie ma/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('the sleep form', () => {
  it('asks for two hours and computes the one value this module computes', async () => {
    const user = userEvent.setup()
    mockedSleep.mockImplementation(() =>
      sleepNight({ fellAsleepAt: '23:40', wokeUpAt: '06:50' }),
    )
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    expect(screen.getByLabelText('Zaśnięcie')).toHaveValue('23:40')
    expect(screen.getByLabelText('Przebudzenie')).toHaveValue('06:50')
    // The night crosses midnight; a subtraction would show a negative figure.
    expect(screen.getByText('7 h 10 min')).toBeInTheDocument()
  })

  it('recomputes the length as the hours are typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)
    await user.clear(screen.getByLabelText('Zaśnięcie'))
    await user.type(screen.getByLabelText('Zaśnięcie'), '22:00')
    await user.type(screen.getByLabelText('Przebudzenie'), '05:30')

    expect(screen.getByText('7 h 30 min')).toBeInTheDocument()
  })

  it('shows no length at all until both hours are there', async () => {
    const user = userEvent.setup()
    mockedSleep.mockImplementation(() => sleepNight({ fellAsleepAt: '23:40' }))
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    // Absent rather than zero — the same rule the diary applies to an untouched
    // slider.
    expect(screen.queryByText(/^\d+ h/)).toBeNull()
    expect(screen.getByText(/Długość snu policzy się/)).toBeInTheDocument()
  })

  it('asks for a correction when the two hours read the same', async () => {
    const user = userEvent.setup()
    mockedSleep.mockImplementation(() =>
      sleepNight({ fellAsleepAt: '23:00', wokeUpAt: '23:00' }),
    )
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    // No figure: 24 h is what the arithmetic says and not what anybody meant.
    expect(screen.queryByText(/\d+ h/)).toBeNull()
    expect(screen.getByText(/Obie godziny są takie same/)).toBeInTheDocument()
  })

  it('words that correction calmly, and never as a failure', async () => {
    const user = userEvent.setup()
    mockedSleep.mockImplementation(() =>
      sleepNight({ fellAsleepAt: '23:00', wokeUpAt: '23:00' }),
    )
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    expect(visiblePanel().textContent).not.toMatch(/błąd|błęd|nieprawidłow|niepoprawn|popraw to/i)
    expect(screen.getByText(/wpis możesz zapisać tak czy inaczej/)).toBeInTheDocument()
  })

  it('still saves a night whose hours collide — no field blocks a save', async () => {
    const user = userEvent.setup()
    mockedSleep.mockImplementation(() =>
      sleepNight({ fellAsleepAt: '23:00', wokeUpAt: '23:00' }),
    )
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)
    const save = screen.getByRole('button', { name: 'Zapisz sen' })
    expect(save).toBeEnabled()

    await user.click(save)
    expect(screen.getByText(/^Zapisano/)).toBeInTheDocument()
  })

  it('tells "nothing filled in" apart from "these two cannot be measured"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    // An empty night waits for an answer; it is not asked to correct one.
    expect(screen.getByText(/Długość snu policzy się/)).toBeInTheDocument()
    expect(screen.queryByText(/Obie godziny są takie same/)).toBeNull()
  })

  it('grades the night 1 to 5, and lets the grade be taken back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)
    const three = screen.getByRole('button', { name: 'Jakość snu: 3 z 5' })

    await user.click(three)
    expect(three).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Jakość snu: 5 z 5' }))
    expect(three).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Jakość snu: 5 z 5' }))
    expect(screen.getByRole('button', { name: 'Jakość snu: 5 z 5' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('counts awakenings from zero and will not go below it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)
    // Scoped to the control's own group: the sleep half has two live regions on
    // it, this one and the computed length.
    const awakenings = () =>
      within(screen.getByRole('group', { name: 'Przebudzenia w nocy' })).getByRole('status')
    expect(awakenings()).toHaveTextContent('0')

    await user.click(screen.getByRole('button', { name: 'Przebudzenia w nocy: mniej' }))
    expect(awakenings()).toHaveTextContent('0')

    await user.click(screen.getByRole('button', { name: 'Przebudzenia w nocy: więcej' }))
    expect(awakenings()).toHaveTextContent('1')
  })

  it('names the morning feelings as nouns', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    expect(screen.getByText('Po przebudzeniu')).toBeInTheDocument()
    for (const label of ['Wyspanie', 'Ociężałość', 'Spokój', 'Napięcie']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // The mockup's own wording, which agrees with a female patient.
    expect(screen.queryByRole('button', { name: 'Wyspana' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Spokojnie' })).toBeNull()
  })

  it('saves with nothing filled in, like every other form in the module', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)
    await user.click(screen.getByRole('button', { name: 'Zapisz sen' }))

    expect(screen.getByText(/^Zapisano/)).toBeInTheDocument()
  })

  it('withdraws the confirmation as soon as anything is edited again', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)
    await user.click(screen.getByRole('button', { name: 'Zapisz sen' }))
    await user.click(screen.getByRole('button', { name: 'Jakość snu: 4 z 5' }))

    expect(screen.queryByText(/^Zapisano/)).toBeNull()
  })

  it('draws no chart of other nights and no score', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    // The mockup's other variant draws "Ostatnie 7 nocy". Reading one night
    // against others is the analysis screen's job.
    expect(visiblePanel().textContent).not.toMatch(/ostatnie|średni|tydzień|wynik|ocena snu/i)
  })
})

describe('the day lock', () => {
  it('says how long today\'s entries stay editable, in the app\'s own words', () => {
    renderWithProviders(<DietActivitySleep />)

    // The sentence is pages/DiaryEntry.tsx's, held once in utils/dayLock.ts —
    // a patient crossing between modules must not meet two explanations of one
    // rule.
    expect(
      within(visiblePanel()).getByText(/możesz edytować do końca dzisiejszego dnia/),
    ).toBeInTheDocument()
  })

  /**
   * THESE TWO GO THROUGH THE REAL LOADER, and that is the point of rewriting
   * them.
   *
   * They used to mock `loadActivityDay` into returning a past date, which is a
   * value the real loader never returns — so they passed over a check that could
   * not fire in production: the screen fixed `today` at mount, derived the day
   * from it and compared the two, i.e. `x === x`. What actually has to move is
   * the clock, so these move the clock and let `useCurrentDay` notice.
   */
  it('locks the form once the calendar day has rolled over under it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 9, 23, 55))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('button', { name: 'Zapisz aktywność' })).toBeEnabled()

    vi.setSystemTime(new Date(2026, 8, 10, 0, 10))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(screen.getByRole('button', { name: 'Zapisz aktywność' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Spacer' })).toBeDisabled()
    expect(screen.getByLabelText('Liczba kroków')).toHaveAttribute('readonly')
    expect(within(visiblePanel()).getAllByText('Tylko odczyt').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: 'Aktywność' }))
  })

  it('stops calling a day that has ended "dzisiaj"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 9, 23, 55))
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('heading', { name: 'Zapisane dzisiaj' })).toBeInTheDocument()

    vi.setSystemTime(new Date(2026, 8, 10, 0, 10))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    // The panel is showing Wednesday's rows while the header says Thursday, so
    // a heading reading "dzisiaj" over them would be a plain falsehood.
    expect(screen.queryByRole('heading', { name: 'Zapisane dzisiaj' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Zapisane' })).toBeInTheDocument()
    expect(screen.getByText(/środa, 9 września/)).toBeInTheDocument()
  })

  it('locks the sleep half on the same terms, and drops the "dzisiaj rano" line', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 9, 23, 55))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<DietActivitySleep />)
    await user.click(screen.getByRole('tab', { name: 'Sen' }))

    vi.setSystemTime(new Date(2026, 8, 10, 0, 10))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    const sleep = visiblePanel()
    expect(screen.getByRole('button', { name: 'Zapisz sen' })).toBeDisabled()
    expect(within(sleep).getByText('Tylko odczyt')).toBeInTheDocument()
    // "obudziłaś lub obudziłeś się dzisiaj rano" is false about a night that
    // ended the previous morning.
    expect(within(sleep).queryByText(/obudziłaś lub obudziłeś/)).toBeNull()
  })

  it('leaves today unlocked', () => {
    mockedActivity.mockImplementation(() => sampleActivityDay(new Date()))
    renderWithProviders(<DietActivitySleep />)

    expect(mockedActivity.mock.results[0].value.date).toBe(TODAY)
    expect(screen.queryByText('Tylko odczyt')).toBeNull()
    expect(screen.getByRole('button', { name: 'Zapisz aktywność' })).toBeEnabled()
  })
})

describe('the language', () => {
  it('leaves no bare feminine ending anywhere on either half', async () => {
    /**
     * The mockup is written throughout in the feminine, because it describes one
     * user's journey; the app has users of both genders. Every departure is
     * either impersonal ("Aktywność dzisiaj" for "Co dzisiaj robiłaś?") or
     * carries both forms.
     *
     * The pattern hunts a feminine past-tense ending that is *not* followed by
     * "lub", which is the module's own dual form (see pages/DietJournals.tsx:
     * "co jadłaś lub jadłeś").
     *
     * Both lookaheads are load-bearing. Without `(?![\p{L}])` the pattern fires
     * inside "właśnie", which contains "łaś" and is not a verb at all — the
     * ending has to end a word. And `\w` is no use here: it does not match ł, ś
     * or any other Polish letter without the `u` flag, so the class is spelled
     * `\p{L}`.
     */
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)
    const halves = [visiblePanel().textContent ?? '']
    await goToSleep(user)
    halves.push(visiblePanel().textContent ?? '')

    for (const text of halves) {
      expect(text).not.toMatch(/[\p{L}]+łaś(?![\p{L}])(?!\s+lub)/u)
      expect(text).not.toMatch(/\b(Wyspana|zmęczona|gotowa|spokojna|najedzona)\b/i)
    }
  })

  it('uses both forms where the sentence has to address the reader', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DietActivitySleep />)

    await goToSleep(user)

    // Feminine first with "lub" — the diet module's convention, not the
    // psychotherapy module's slash.
    expect(screen.getByText(/obudziłaś lub obudziłeś/)).toBeInTheDocument()
  })

  it('replaces the mockup\'s "Co dzisiaj robiłaś?" with a noun phrase', () => {
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByRole('heading', { name: 'Aktywność dzisiaj' })).toBeInTheDocument()
    expect(screen.queryByText(/robiłaś/)).toBeNull()
  })
})

describe('the activity list is paginated', () => {
  /**
   * The weakest case in the module and included for consistency with the rest
   * of it: nothing here is stored, so a reload empties the list and an ordinary
   * day holds a handful of rows. What matters is the two properties below —
   * that the ordinary day meets no control at all, and that the sleep half
   * never grows a second one, because there is one `?page=` to go round.
   */
  const entries = (count: number) =>
    // Newest first, the order the panel writes in.
    Array.from({ length: count }, (_, index) => ({
      id: `a-${index}`,
      date: TODAY,
      time: `${String(20 - index).padStart(2, '0')}:00`,
      kind: 'Spacer',
      kindOther: '',
      durationMinutes: 30,
      feelingAfter: null,
    }))

  it('draws no control over an ordinary day', () => {
    mockedActivity.mockImplementation(() => activityDay({ entries: entries(PAGE_SIZE) }))
    renderWithProviders(<DietActivitySleep />)

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('shows seven entries on a page and counts them as wpisy', () => {
    mockedActivity.mockImplementation(() => activityDay({ entries: entries(20) }))
    renderWithProviders(<DietActivitySleep />)

    expect(screen.getByText(/Strona 1 z 3/)).toBeInTheDocument()
    expect(screen.getByText(/1–7 z 20 wpisów/)).toBeInTheDocument()
    // "Spacer · 30 min" — the row composes the kind with the duration.
    expect(within(visiblePanel()).getAllByText(/^Spacer · /)).toHaveLength(PAGE_SIZE)
  })

  it('moves through the pages', async () => {
    const user = userEvent.setup()
    mockedActivity.mockImplementation(() => activityDay({ entries: entries(20) }))
    renderWithProviders(<DietActivitySleep />)

    await user.click(screen.getByRole('button', { name: /następna/i }))

    expect(screen.getByText(/Strona 2 z 3/)).toBeInTheDocument()
    expect(within(visiblePanel()).getByText('13:00')).toBeInTheDocument()
    expect(within(visiblePanel()).queryByText('20:00')).toBeNull()
  })

  it('leaves the sleep half with no control of its own', async () => {
    // One `?page=` per screen: a second paginated list here would turn this
    // one's pages. The sleep panel is a form and a night, never a list.
    const user = userEvent.setup()
    mockedActivity.mockImplementation(() => activityDay({ entries: entries(20) }))
    renderWithProviders(<DietActivitySleep />)
    expect(screen.getAllByRole('navigation', { name: 'Paginacja' })).toHaveLength(1)

    await goToSleep(user)

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('goes back to page one when an activity is written, so it is on screen', async () => {
    const user = userEvent.setup()
    mockedActivity.mockImplementation(() => activityDay({ entries: entries(20) }))
    renderWithProviders(<DietActivitySleep />)
    await user.click(screen.getByRole('button', { name: /następna/i }))
    expect(screen.getByText(/Strona 2 z 3/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zapisz aktywność' }))

    // 21 entries is still three pages; what changed is which one is on screen.
    expect(screen.getByText(/Strona 1 z 3/)).toBeInTheDocument()
    expect(screen.getByText(/1–7 z 21 wpisów/)).toBeInTheDocument()
  })
})
