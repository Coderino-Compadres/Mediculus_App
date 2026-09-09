/**
 * The diet module's data — or rather, the one place that knows there is none.
 *
 * THERE IS NO ENDPOINT. `core/urls.py` exposes nothing under `/api/diet/`, and
 * `medical_db` has no table a meal could go into: the module is a mockup plus,
 * from today, one screen. What this file does is keep that fact in a single
 * named place instead of spreading it across the screen as literals.
 *
 * WHY AN EMPTY DAY RATHER THAN A REQUEST THAT FAILS. A `fetchDietDay()` calling
 * a URL that answers 404 would put "Nie udało się wczytać" on a screen where
 * nothing failed — the module simply has not been written to yet, because it
 * cannot be. The empty day is not a placeholder for real data; for a module in
 * which no meal can be recorded, it *is* the true state, and every number on it
 * is one the app can stand behind: no meals, no streak, no glasses.
 *
 * WHAT MUST NOT HAPPEN HERE is the mockup's own sample data — "6 dni z rzędu",
 * "0 z 6 szklanek" over a half-full bar — being copied in to make the screen
 * look alive. The project has been here before: the home screen's technique card
 * could only ever show the three names `mock_data.sql` seeds, and it was removed
 * rather than left looking like a feature (see CLAUDE.md). A streak of 6 for a
 * patient who has never written a meal is the same lie with a nicer number.
 *
 * WHEN THE BACKEND ARRIVES this file grows a `fetchDietDay()` that maps the
 * payload onto `DietDay`, the screen gains the loading/error states every other
 * screen has, and `emptyDietDay` stays as what a patient's first day looks like.
 */

import { toIsoDate } from '../utils/days'
import type {
  DietActivityDay,
  DietActivityEntry,
  DietDay,
  DietJournalDay,
  DietSleepNight,
} from '../types/diet'

/**
 * Glasses of water the module suggests per day.
 *
 * Taken from the mockup ("0 z 6 szklanek"). It is a *display target*, not a
 * clinical recommendation — the app is not entitled to tell anybody how much to
 * drink, and a psychodietitian setting it per patient is the obvious next step.
 * Exported so the screen renders the number rather than spelling it out, and so
 * that moving it into the profile later touches one line.
 */
export const DIET_HYDRATION_TARGET = 6

/**
 * A day nothing has been written to yet — today, for every account, until the
 * module has a backend.
 *
 * `date` is taken in the reader's own calendar day (`toIsoDate`), the same rule
 * `core/days.py` applies on the server: the day a diary belongs to is a calendar
 * question, not a UTC one.
 */
export function emptyDietDay(today: Date = new Date()): DietDay {
  return {
    date: toIsoDate(today),
    streakDays: 0,
    mealCount: 0,
    hydration: { glasses: 0, target: DIET_HYDRATION_TARGET },
  }
}

/**
 * The food diary's history — every day that holds a meal, newest first.
 *
 * Empty for the same reason `emptyDietDay` is all-zeros: nothing writes a meal
 * yet, so "no days" is the true answer rather than a placeholder for one. When
 * `GET /api/diet/journals/` exists this becomes the mapping layer and the screen
 * gains the loading and failure states every other list in the app has —
 * neither is written today, because a load that cannot fail has no failure to
 * report and a screen that says "nie udało się wczytać" about a module nothing
 * has written to would be a lie.
 */
export function emptyDietHistory(): DietJournalDay[] {
  return []
}

/* ------------------------------------------------------------------ *
 *  Aktywność i sen (§09)
 *
 *  Same terms as everything above: there is no `/api/diet/activity/` and no
 *  `/api/diet/sleep/` either, so these are the "empty" producers plus, for the
 *  first time in this file, a pair of *sample* producers.
 *
 *  WHY SAMPLES ARE ALLOWED HERE AND NOT ON THE HOME SCREEN. The rule this file
 *  opens with — never copy the mockup's figures onto a screen a patient sees —
 *  is about what the app *claims*. `emptyActivityDay` and `emptySleepNight` are
 *  still what the screens call, so a patient is shown nothing that was not
 *  written by them. `sampleActivityDay`/`sampleSleepNight` are not wired to
 *  anything: they exist so the filled state can be looked at and tested, and
 *  every value in them is dated relative to the day they are asked for rather
 *  than frozen, so they never quietly become stale demo data.
 *
 *  HOW TO SEE THE FILLED STATE. In `loadActivityDay`/`loadSleepNight` below,
 *  swap the `empty…` call for the `sample…` one. That is the whole change, and
 *  it is deliberately in this file rather than in the screens — when the real
 *  endpoints arrive, these two functions become `fetch` calls and nothing on
 *  either screen moves. Passing the sample an earlier date (e.g.
 *  `sampleActivityDay(new Date(Date.now() - 864e5))`) shows the third state:
 *  a day that has ended, which both panels render read-only.
 * ------------------------------------------------------------------ */

/**
 * Ids for entries that exist only in the browser.
 *
 * A counter rather than `crypto.randomUUID()`: the id's only job today is to be
 * a stable React key, the real one will come from the database, and the prefix
 * says out loud that nothing here has been persisted. Also works in every test
 * environment without a crypto stub.
 */
let localEntries = 0

export function nextLocalActivityId(): string {
  localEntries += 1
  return `local-activity-${localEntries}`
}

/** 'HH:MM' in the reader's own clock — when an entry is being written. */
export function localTime(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/** What the add-form has collected: an entry minus the two stamps below. */
export type ActivityAnswers = Pick<
  DietActivityEntry,
  'kind' | 'kindOther' | 'durationMinutes' | 'feelingAfter'
>

/**
 * An entry, stamped with the moment it is being written.
 *
 * **THE DATE IS READ FROM THE CLOCK HERE, AT SAVE TIME, AND NOWHERE ELSE.** It
 * used to be copied off the day object the screen had loaded, whose `date` was
 * fixed when the route mounted — so an activity saved at 00:10 was filed under
 * the previous day. That is the worst class of defect this module can have: not
 * a control that misbehaves, which the next tap corrects, but a row that goes
 * into the database attributed to a day it did not happen on, and then feeds a
 * specialist's reading of the week. The day lock is what stops the save; this is
 * what makes the save correct even if the lock is ever wrong again.
 *
 * A function in the data layer rather than three lines in the panel, because the
 * stamp is the part worth testing on its own — a component test can watch a
 * button and a list, but it cannot see which day a row was filed under.
 *
 * `now` is injectable for exactly that test; production never passes it.
 */
export function newActivityEntry(
  answers: ActivityAnswers,
  now: Date = new Date(),
): DietActivityEntry {
  return {
    id: nextLocalActivityId(),
    date: toIsoDate(now),
    time: localTime(now),
    ...answers,
  }
}

/** A day nothing has been written to: no activities, no step count. */
export function emptyActivityDay(today: Date = new Date()): DietActivityDay {
  return { date: toIsoDate(today), entries: [], steps: null }
}

/**
 * A night nobody has described yet.
 *
 * An object rather than null, because the sleep screen is a form: there is
 * always a night on it (the one that ended this morning), and the question is
 * only whether anything has been filled in. `awakenings` starts at 0 — the
 * control's floor, and the answer for an unbroken night — while every other
 * field starts null, which is what "not answered" looks like everywhere else in
 * this app.
 */
export function emptySleepNight(today: Date = new Date()): DietSleepNight {
  return {
    date: toIsoDate(today),
    fellAsleepAt: null,
    wokeUpAt: null,
    quality: null,
    awakenings: 0,
    wakeFeeling: null,
  }
}

/** A day with something on it. Not wired to a screen — see the note above. */
export function sampleActivityDay(today: Date = new Date()): DietActivityDay {
  const date = toIsoDate(today)
  return {
    date,
    steps: 6400,
    entries: [
      {
        id: 'sample-activity-2',
        date,
        time: '18:00',
        kind: 'Spacer',
        kindOther: '',
        durationMinutes: 35,
        feelingAfter: 'better',
      },
      {
        id: 'sample-activity-1',
        date,
        time: '07:00',
        kind: 'Joga',
        kindOther: '',
        durationMinutes: 25,
        feelingAfter: 'neutral',
      },
    ],
  }
}

/** A night with something on it, crossing midnight as most nights do. */
export function sampleSleepNight(today: Date = new Date()): DietSleepNight {
  return {
    date: toIsoDate(today),
    fellAsleepAt: '23:40',
    wokeUpAt: '06:50',
    quality: 3,
    awakenings: 1,
    wakeFeeling: 'heavy',
  }
}

/**
 * What the activity screen reads.
 *
 * The one line to change when `GET /api/diet/activity/` exists, and the one to
 * change to look at the filled state today.
 */
export function loadActivityDay(today: Date = new Date()): DietActivityDay {
  return emptyActivityDay(today)
}

/** The same for the sleep screen. */
export function loadSleepNight(today: Date = new Date()): DietSleepNight {
  return emptySleepNight(today)
}
