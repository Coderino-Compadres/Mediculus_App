/**
 * The diet module's data — a mapping layer, and nothing else.
 *
 * IT IS ALL REAL NOW. This file used to open by saying which half of the module
 * existed and which half it invented: `emptyDietDay()` answered "no meals, no
 * streak" for every account, because no table recorded a meal and zero was
 * therefore the true answer rather than a placeholder. `hydration` was the first
 * table; `diet_meal`, `supplement` and `supplement_intake` closed the rest. So
 * every function below is one request and one snake_case→camelCase mapping, with
 * no defaults invented anywhere:
 *
 * EVERY PATH BELOW CARRIES THE `/api` PREFIX, and that is not decoration:
 * `apiRequest` prepends nothing (see `src/api/client.ts` — `BASE_URL` is the
 * *origin*, empty for same-origin), so the prefix is the caller's job, the way
 * every other module in `src/api/` writes it. This file had it wrong for the
 * hydration endpoints: `'/diet/hydration/'` reached the Vite dev server as a
 * page address, came back as a 404 carrying HTML, and surfaced as the generic
 * "Coś poszło nie tak" — silently on the home screen, which swallows that
 * card's failure by design. `api/client.test.ts` now refuses a path without
 * the prefix, so this cannot come back on the next module.
 *
 *   GET    /api/diet/today/                          → `fetchDietDay`
 *   GET    /api/diet/meals/                           → `fetchDietHistory`
 *   GET    /api/diet/hydration/                       → `fetchHydration`
 *   POST   /api/diet/hydration/                       → `recordDrink`
 *   DELETE /api/diet/hydration/<id>/                  → `removeDrink`
 *   GET    /api/diet/supplements/                     → `fetchSupplements`
 *   POST   /api/diet/supplements/                     → `createSupplement`
 *   PUT    /api/diet/supplements/<id>/                → `updateSupplement`
 *   DELETE /api/diet/supplements/<id>/                → `deleteSupplement`
 *   POST   /api/diet/supplements/<id>/intake/         → `setSupplementTaken`
 *   DELETE /api/diet/supplements/<id>/intake/         → `setSupplementTaken`
 *
 * `emptyDietDay` stays, and is no longer a stand-in for a missing backend: it is
 * what the home screen renders *before its first request answers*, so it has a
 * shape to draw during the load rather than a branch on null. The important
 * part is that it is not what the screen settles on — a failed load is reported
 * as one. Its sibling `emptyDietHistory` is **gone**: the history screen holds
 * its own `[]` and tells a failure apart from an empty diary, so an exported
 * producer of "no days" was left standing for nothing.
 *
 * WHAT MUST NOT HAPPEN HERE is the mockup's own sample data — "6 dni z rzędu"
 * over a diary nobody has written — being copied in to make a screen look alive.
 * The project has been here before: the home screen's technique card could only
 * ever show the three names `mock_data.sql` seeds, and it was removed rather
 * than left looking like a feature (see CLAUDE.md).
 *
 * THREE WRITES ANSWER WITH THE WHOLE COLLECTION rather than the row they wrote —
 * `recordDrink`, every supplement write, and the tick. Several figures move when
 * one glass is recorded, and the supplement list is ordered by hour so a new row
 * does not land at the end; rebuilding either in the browser is how one day ends
 * up with two versions of itself.
 */

import { apiRequest } from './client'
import { toIsoDate } from '../utils/days'
import { WATER } from '../utils/drinks'
import type { DrinkName } from '../utils/drinks'
import type {
  DietDay,
  DietJournalDay,
  HydrationDay,
  Supplement,
  SupplementInput,
  HydrationDayTotal,
  HydrationEntry,
} from '../types/diet'

/**
 * A day with nothing in it — what a screen draws while its first request is in
 * flight, so it has a shape rather than a branch on null.
 *
 * It is deliberately *not* what a screen settles on when a request fails: an
 * empty day and a failed load are different statements, and rendering the first
 * for the second would tell a patient their diary is empty when it is only
 * unreachable — the mistake `Journals.tsx` is careful about.
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

/* ------------------------------------------------------------------ *
 * The food diary. Read-only, because §04's form is not built — see the
 * file header.
 * ------------------------------------------------------------------ */

/** As `core.meals.build_diet_day` sends it. */
interface DietDayPayload {
  date: string
  streak_days: number
  meal_count: number
}

/** As `core.meals.serialize_meal` sends it. */
interface DietMealPayload {
  id: string
  kind: string | null
  time: string | null
  description: string
}

interface DietJournalDayPayload {
  date: string
  meals: DietMealPayload[]
}

/** Today's meal count and the food diary's own streak. */
export async function fetchDietDay(): Promise<DietDay> {
  const payload = await apiRequest<DietDayPayload>('/api/diet/today/')
  return {
    date: payload.date,
    streakDays: payload.streak_days,
    mealCount: payload.meal_count,
  }
}

/**
 * Every day that holds a meal, newest first.
 *
 * Grouped by the server, not here: `entry_date` is where the answer to "which
 * day is this meal on" already lives, and grouping it a second time in the
 * browser is how one meal ends up on two Tuesdays.
 */
export async function fetchDietHistory(): Promise<DietJournalDay[]> {
  const payload = await apiRequest<DietJournalDayPayload[]>('/api/diet/meals/')
  return payload.map((day) => ({
    date: day.date,
    meals: day.meals.map((meal) => ({
      id: meal.id,
      kind: meal.kind,
      time: meal.time,
      description: meal.description,
    })),
  }))
}

/* ------------------------------------------------------------------ *
 * Nawodnienie — the mapping layer, and nothing but.
 * ------------------------------------------------------------------ */

const HYDRATION_URL = '/api/diet/hydration/'

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

/* ------------------------------------------------------------------ *
 * Suplementy i leki — §08's second half.
 * ------------------------------------------------------------------ */

const SUPPLEMENTS_URL = '/api/diet/supplements/'

/** As `core.supplements.serialize_supplement` sends it. */
interface SupplementPayload {
  id: string
  name: string
  dose: string | null
  frequency: string | null
  hour: string | null
  start_date: string | null
  end_date: string | null
  reminder_enabled: boolean
  taken_today: boolean
}

function toSupplement(payload: SupplementPayload): Supplement {
  return {
    id: payload.id,
    name: payload.name,
    dose: payload.dose,
    frequency: payload.frequency,
    hour: payload.hour,
    startDate: payload.start_date,
    endDate: payload.end_date,
    reminderEnabled: payload.reminder_enabled,
    takenToday: payload.taken_today,
  }
}

/**
 * The form's state as the API's own column names.
 *
 * A blank answer is sent as `null` rather than as `''`: the server normalises
 * both to NULL, and sending the empty string would leave two representations of
 * "not answered" travelling for a column that has one.
 */
function toPayload(input: SupplementInput): Record<string, unknown> {
  const text = (value: string | null) => {
    const trimmed = (value ?? '').trim()
    return trimmed === '' ? null : trimmed
  }
  return {
    name: input.name.trim(),
    dose: text(input.dose),
    frequency: text(input.frequency),
    hour: text(input.hour),
    start_date: text(input.startDate),
    end_date: text(input.endDate),
    reminder_enabled: input.reminderEnabled,
  }
}

/** The whole list, each row saying whether it was ticked off today. */
export async function fetchSupplements(): Promise<Supplement[]> {
  const payload = await apiRequest<SupplementPayload[]>(SUPPLEMENTS_URL)
  return payload.map(toSupplement)
}

/**
 * Add one, and get the whole list back.
 *
 * The list is ordered by hour on the server, so a new row rarely belongs at the
 * end — appending it here would put it in the wrong place until the next load.
 */
export async function createSupplement(input: SupplementInput): Promise<Supplement[]> {
  const payload = await apiRequest<SupplementPayload[]>(SUPPLEMENTS_URL, {
    method: 'POST',
    body: toPayload(input),
  })
  return payload.map(toSupplement)
}

/**
 * Correct one.
 *
 * PUT replaces rather than merges, which is the server's rule and this layer
 * sends the whole form to match it: a cleared dose is an answer taken back, not
 * one left unchanged.
 */
export async function updateSupplement(
  id: string,
  input: SupplementInput,
): Promise<Supplement[]> {
  const payload = await apiRequest<SupplementPayload[]>(`${SUPPLEMENTS_URL}${id}/`, {
    method: 'PUT',
    body: toPayload(input),
  })
  return payload.map(toSupplement)
}

/**
 * Drop one from the list. Answers 204, so this resolves to nothing.
 *
 * It takes that preparation's ticks with it (CASCADE on the server). The screen
 * asks twice before calling it, for that reason.
 */
export async function deleteSupplement(id: string): Promise<void> {
  await apiRequest<void>(`${SUPPLEMENTS_URL}${id}/`, { method: 'DELETE' })
}

/**
 * "Odhacz, kiedy weźmiesz" — and taking the tick back.
 *
 * One function for both directions, because they are one control: a checkbox
 * whose two states are a POST and a DELETE on the same URL. The day is the
 * server's own (`timezone.localdate()`), so nothing here sends a date — only
 * today is tickable, and a date in the body could not reach a past day anyway.
 *
 * Answers with the rebuilt list, so the checkbox on screen is the state the
 * server holds rather than one the browser flipped optimistically.
 */
export async function setSupplementTaken(
  id: string,
  taken: boolean,
): Promise<Supplement[]> {
  const payload = await apiRequest<SupplementPayload[]>(
    `${SUPPLEMENTS_URL}${id}/intake/`,
    { method: taken ? 'POST' : 'DELETE' },
  )
  return payload.map(toSupplement)
}
