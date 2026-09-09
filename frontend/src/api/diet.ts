/**
 * The diet module's data — half of it real, and the file says which half.
 *
 * NAWODNIENIE IS REAL. `GET/POST /api/diet/hydration/` and
 * `DELETE /api/diet/hydration/<id>/` exist, `medical_db` has a `hydration`
 * table, and everything below the mapping layer is an ordinary endpoint: the
 * session is the only identity input, a guardian or a specialist is refused, and
 * the figures come back already computed so the screen recomputes none of them.
 *
 * EVERYTHING ELSE IS NOT. `core/urls.py` exposes nothing else under `/api/diet/`
 * and no table records a meal, so `emptyDietDay` and `emptyDietHistory` stay
 * exactly as they were and for exactly the same reason:
 *
 * WHY AN EMPTY DAY RATHER THAN A REQUEST THAT FAILS. A `fetchDietDay()` calling
 * a URL that answers 404 would put "Nie udało się wczytać" on a screen where
 * nothing failed — the module simply has not been written to yet, because it
 * cannot be. The empty day is not a placeholder for real data; for a module in
 * which no meal can be recorded, it *is* the true state, and every number on it
 * is one the app can stand behind: no meals, no streak.
 *
 * WHAT MUST NOT HAPPEN HERE is the mockup's own sample data — "6 dni z rzędu"
 * over a diary nobody has written — being copied in to make the screen look
 * alive. The project has been here before: the home screen's technique card
 * could only ever show the three names `mock_data.sql` seeds, and it was removed
 * rather than left looking like a feature (see CLAUDE.md).
 *
 * WHEN THE REST OF THE BACKEND ARRIVES, `fetchHydration` below is the shape to
 * copy: a mapping layer and nothing else, snake_case in and camelCase out.
 */

import { apiRequest } from './client'
import { toIsoDate } from '../utils/days'
import { WATER } from '../utils/drinks'
import type { DrinkName } from '../utils/drinks'
import type {
  DietDay,
  DietJournalDay,
  HydrationDay,
  HydrationDayTotal,
  HydrationEntry,
} from '../types/diet'

/**
 * A day nothing has been written to yet — today, for every account, until the
 * *food diary* has a backend. Hydration is no longer part of it.
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
  }
}

/**
 * The food diary's history — every day that holds a meal, newest first.
 *
 * Empty for the same reason `emptyDietDay` is all-zeros: nothing writes a meal
 * yet, so "no days" is the true answer rather than a placeholder for one.
 */
export function emptyDietHistory(): DietJournalDay[] {
  return []
}

/* ------------------------------------------------------------------ *
 * Nawodnienie — the mapping layer, and nothing but.
 * ------------------------------------------------------------------ */

const HYDRATION_URL = '/diet/hydration/'

/** As `core.hydration.serialize_entry` sends it. */
interface HydrationEntryPayload {
  id: string
  drink: string
  amount_ml: number | null
  at: string | null
}

interface HydrationDayTotalPayload {
  date: string
  water_ml: number
  glasses: number
}

/** As `core.hydration.build_hydration_day` sends it. */
interface HydrationDayPayload {
  date: string
  glass_ml: number
  bottle_ml: number
  target_glasses: number
  min_amount_ml: number
  max_amount_ml: number
  water_ml: number
  glasses: number
  progress: number
  entries: HydrationEntryPayload[]
  week: HydrationDayTotalPayload[]
}

interface HydrationWritePayload {
  entry: HydrationEntryPayload
  day: HydrationDayPayload
}

function toEntry(payload: HydrationEntryPayload): HydrationEntry {
  return {
    id: payload.id,
    // The server validates the name against `core/drinks.py`, whose list is
    // pinned to `utils/drinks.ts` by test_drinks.py — so a value arriving here
    // is one of ours. The cast records that this is the one place the two lists
    // are assumed to agree.
    drink: payload.drink as DrinkName,
    amountMl: payload.amount_ml,
    at: payload.at,
  }
}

function toDay(payload: HydrationDayPayload): HydrationDay {
  return {
    date: payload.date,
    glassMl: payload.glass_ml,
    bottleMl: payload.bottle_ml,
    targetGlasses: payload.target_glasses,
    minAmountMl: payload.min_amount_ml,
    maxAmountMl: payload.max_amount_ml,
    waterMl: payload.water_ml,
    glasses: payload.glasses,
    progress: payload.progress,
    entries: payload.entries.map(toEntry),
    week: payload.week.map(
      (day): HydrationDayTotal => ({
        date: day.date,
        waterMl: day.water_ml,
        glasses: day.glasses,
      }),
    ),
  }
}

/** Today's water, today's servings and the last seven days. */
export async function fetchHydration(): Promise<HydrationDay> {
  return toDay(await apiRequest<HydrationDayPayload>(HYDRATION_URL))
}

/**
 * Record one serving, and get the whole day back.
 *
 * The answer carries the rebuilt day rather than only the row that was written,
 * because three figures on screen move when one glass is recorded — the count,
 * the bar and today's column in the chart. Rebuilding them here from a single
 * row is how one day would end up with two versions of itself.
 *
 * `amountMl` is required for water and refused for everything else, which is the
 * server's rule and not this layer's: sending 250 ml of tea is a 400, on
 * purpose, rather than a number quietly dropped.
 */
export async function recordDrink(
  amountMl: number | null,
  drink: DrinkName = WATER,
): Promise<HydrationDay> {
  const body: { drink: DrinkName; amount_ml?: number } = { drink }
  if (amountMl !== null) body.amount_ml = amountMl
  const payload = await apiRequest<HydrationWritePayload>(HYDRATION_URL, {
    method: 'POST',
    body,
  })
  return toDay(payload.day)
}

/**
 * Undo one of today's servings.
 *
 * Answers 204 with no body, so this resolves to nothing and the screen re-reads.
 * A serving from a past day answers 404 — yesterday's glass is as immutable as
 * yesterday's diary entry, and no screen offers to delete one.
 */
export async function removeDrink(id: string): Promise<void> {
  await apiRequest<void>(`${HYDRATION_URL}${id}/`, { method: 'DELETE' })
}
