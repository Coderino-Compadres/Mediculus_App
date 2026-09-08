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
import type { DietDay, DietJournalDay } from '../types/diet'

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
