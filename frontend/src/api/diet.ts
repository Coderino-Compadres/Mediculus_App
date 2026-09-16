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
 *   POST   /api/diet/meals/                           → `createMeal`
 *   GET    /api/diet/days/<date>/                     → `fetchDietJournalDay`
 *   PUT    /api/diet/meals/<id>/                      → `updateMeal`
 *   DELETE /api/diet/meals/<id>/                      → `deleteMeal`
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

import { apiDownload, apiRequest } from './client'
import { toIsoDate } from '../utils/days'
import { WATER } from '../utils/drinks'
import type { FeelingAfter } from '../utils/activity'
import type { EmotionName } from '../utils/emotions'
import type { SleepQuality, WakeFeeling } from '../utils/sleep'
import type {
  DietMealSlot,
  DietReportDay,
  DietReportEmotions,
  DietWeeklyReport,
} from '../types/dietReport'
import type {
  DietActivityDay,
  DietActivityEntry,
  DietDay,
  DietJournalDay,
  DietMeal,
  DietMealInput,
  DietMealSaved,
  DietSleepNight,
  HydrationDay,
  HydrationDayTotal,
  HydrationEntry,
  Supplement,
  SupplementInput,
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
    meals: [],
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
  /** Optional on the wire, not in the type the screens read. A backend a
   *  release behind this file sends a day with no `meals` key, and throwing on
   *  it would take the whole screen down to show a count of zero — strictly
   *  worse than the count the server did send, next to an empty list. Same
   *  judgement as `needsConsents` failing open in `api/auth.ts`. */
  meals?: DietMealPayload[]
}

/** As `core.meals.serialize_meal` sends it. */
interface DietMealPayload {
  id: string
  kind: string | null
  time: string | null
  description: string
  /** Optional on the wire for the reason `DietDayPayload.meals` is: a backend a
   *  release behind this file sends a meal with no `emotions` key, and throwing
   *  on it would take a whole day of the diary down rather than draw the meal
   *  without the chips it does not know about. */
  emotions?: DietMealEmotionPayload[]
}

/** One chip, as `core.meals._serialize_emotions` sends it. */
interface DietMealEmotionPayload {
  emotion: string
  /** `null` for a chip picked with the slider never moved — not a 0. The column
   *  is nullable precisely so this distinction survives the round trip. */
  intensity: number | null
}

interface DietJournalDayPayload {
  date: string
  meals: DietMealPayload[]
}

/**
 * One day, mapped once.
 *
 * Four callers now — the read and the three writes that answer with the
 * rebuilt day — and the shape gained a field the moment today's meals became
 * editable. Four copies of that mapping would be four chances for one of them
 * to keep sending a day with no meals in it.
 */
function toDietDay(payload: DietDayPayload): DietDay {
  return {
    date: payload.date,
    streakDays: payload.streak_days,
    mealCount: payload.meal_count,
    meals: (payload.meals ?? []).map(toMeal),
  }
}

/** Today's meals, their count, and the food diary's own streak. */
export async function fetchDietDay(): Promise<DietDay> {
  return toDietDay(await apiRequest<DietDayPayload>('/api/diet/today/'))
}

/**
 * Every day that holds a meal, newest first.
 *
 * Grouped by the server, not here: `entry_date` is where the answer to "which
 * day is this meal on" already lives, and grouping it a second time in the
 * browser is how one meal ends up on two Tuesdays.
 */
/** One meal, mapped once — the history reads it and so does the write's answer,
 *  and two copies of a five-field mapping are two copies free to drift. */
function toMeal(meal: DietMealPayload): DietMeal {
  return {
    id: meal.id,
    kind: meal.kind,
    time: meal.time,
    description: meal.description,
    emotions: (meal.emotions ?? []).map((rating) => ({
      // The server sends one of the ten (`core.emotions.EMOTIONS` is a
      // ChoiceField), which is the same list `EmotionName` spells — asserted
      // rather than validated here for the reason `api/diary.ts` does the
      // same, and `emotions.test.ts` pins the two vocabularies together.
      emotion: rating.emotion as EmotionName,
      intensity: rating.intensity,
    })),
  }
}

export async function fetchDietHistory(): Promise<DietJournalDay[]> {
  const payload = await apiRequest<DietJournalDayPayload[]>('/api/diet/meals/')
  return payload.map(toJournalDay)
}

/** One day, mapped exactly like a row of the history — see `toJournalDay`. */
function toJournalDay(day: DietJournalDayPayload): DietJournalDay {
  return { date: day.date, meals: day.meals.map(toMeal) }
}

/**
 * One day of the history, opened out.
 *
 * Its own request rather than filtering what `fetchDietHistory` returned: a
 * screen reached by a link — a reload, a bookmark, the back button — has no
 * such list to filter, and pulling the whole diary to render one day would be
 * the cost of pretending otherwise.
 *
 * A day holding no meal is a 404 from the server, which the screen words as
 * "nothing here" rather than as a failure — the history lists exactly the days
 * that hold one, so any other date names nothing.
 */
export async function fetchDietJournalDay(date: string): Promise<DietJournalDay> {
  return toJournalDay(
    await apiRequest<DietJournalDayPayload>(`/api/diet/days/${date}/`),
  )
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
  max_drink_name: number
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
    drink: payload.drink,
    amountMl: payload.amount_ml,
    at: payload.at,
  }
}

/** One day's water figure — a column of the seven-day chart, and the same shape
 *  a weekly report carries for a day. Named rather than inlined because both
 *  read it: two copies would be two answers about how much water Tuesday held. */
function toDayTotal(day: HydrationDayTotalPayload): HydrationDayTotal {
  return {
    date: day.date,
    waterMl: day.water_ml,
    glasses: day.glasses,
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
    maxDrinkName: payload.max_drink_name,
    waterMl: payload.water_ml,
    glasses: payload.glasses,
    progress: payload.progress,
    entries: payload.entries.map(toEntry),
    week: payload.week.map(toDayTotal),
  }
}

/**
 * The picked chips, as the API reads them.
 *
 * `intensity` IS OMITTED RATHER THAN SENT AS NULL for a chip nobody rated. The
 * field is optional on `MealEmotionSerializer`, absent and null mean the same
 * thing there, and leaving it out is the shape that says "unanswered" without
 * a key at all — the same choice `orNull` makes for the diary's text fields in
 * reverse. What must never happen is a 0 going out for a slider nobody moved.
 *
 * Always sent, empty list included: the write replaces, so an emotion left out
 * is one the patient un-picked, and omitting the key entirely would make
 * clearing them impossible from the only form that writes them.
 */
function toEmotionsPayload(input: DietMealInput) {
  return input.emotions.map((entry) =>
    entry.intensity === null
      ? { emotion: entry.emotion }
      : { emotion: entry.emotion, intensity: entry.intensity },
  )
}

/** Today's water, today's servings and the last seven days. */
/**
 * Write one meal — §04's "Dodawanie posiłku".
 *
 * THE DAY IS NOT SENT, and that is the rule rather than a saving of bytes: the
 * server stamps `entry_date` from its own clock, so this form can only ever
 * address today. A browser that could name the day would be a form on a screen
 * showing today, quietly writing into the archive — and the phone left open
 * overnight is not a hypothetical, it is why `utils/dayLock.ts` exists.
 *
 * A BLANK ANSWER TRAVELS AS NULL rather than as '', so "not answered" has one
 * representation on the wire. `description` is the exception and matches its
 * column: '' is what an empty box means there, with no third state to tell
 * apart.
 *
 * It answers with the row *and* the rebuilt day, which is why the return type
 * carries both — see `DietMealSaved`.
 */
export async function createMeal(input: DietMealInput): Promise<DietMealSaved> {
  const payload = await apiRequest<{ meal: DietMealPayload; day: DietDayPayload }>(
    '/api/diet/meals/',
    {
      method: 'POST',
      body: {
        kind: input.kind || null,
        time: input.time || null,
        description: input.description.trim(),
        emotions: toEmotionsPayload(input),
      },
    },
  )
  return { meal: toMeal(payload.meal), day: toDietDay(payload.day) }
}

/**
 * Correct today's meal — PUT, so it **replaces** rather than merges.
 *
 * The form submits its whole state, the same rule as the diary's own entry and
 * the supplement form: a field cleared on screen is an answer taken back, not
 * one left alone. Sending only what changed would make clearing the hour
 * impossible from the only form that writes it.
 *
 * The day is not sent here either, and on an edit that matters more than on a
 * create: the server refuses to move a meal between days, so a browser that
 * tried would be silently ignored rather than told.
 *
 * ONLY TODAY'S MEAL. An older one answers 403 with the server's own sentence
 * (`meals.MEAL_NOT_TODAY`) rather than a 404 — it is on the history screen in
 * front of the patient, so "no such thing" would be the wrong answer. Screens
 * render that message rather than a generic one.
 */
export async function updateMeal(
  id: string,
  input: DietMealInput,
): Promise<DietMealSaved> {
  const payload = await apiRequest<{ meal: DietMealPayload; day: DietDayPayload }>(
    `/api/diet/meals/${id}/`,
    {
      method: 'PUT',
      body: {
        kind: input.kind || null,
        time: input.time || null,
        description: input.description.trim(),
        emotions: toEmotionsPayload(input),
      },
    },
  )
  return { meal: toMeal(payload.meal), day: toDietDay(payload.day) }
}

/**
 * Drop today's meal, and answer with the day it left behind.
 *
 * The rebuilt day rather than nothing, because three things on the home screen
 * move when one meal goes: the list, the count and the streak — a day emptied
 * of its last meal breaks the run. Recomputing that in the browser is how one
 * day ends up with two versions of itself.
 */
export async function deleteMeal(id: string): Promise<DietDay> {
  const payload = await apiRequest<{ day: DietDayPayload }>(
    `/api/diet/meals/${id}/`,
    { method: 'DELETE' },
  )
  return toDietDay(payload.day)
}

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
 *
 * `drink` IS A `string`, NOT A `DrinkName`, because the chips are the quick way
 * in rather than the whole vocabulary — a patient may type a name of their own.
 * Nothing is normalised here: folding "herbata" onto "Herbata" is the server's
 * job (`normalize_drink`), and a second definition of "is this the same drink"
 * in the browser is exactly the drift the shared vocabularies are tested
 * against. The name travels as typed and comes back as stored.
 */
export async function recordDrink(
  amountMl: number | null,
  drink: string = WATER,
): Promise<HydrationDay> {
  const body: { drink: string; amount_ml?: number } = { drink }
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
  /** Optional on the wire for the reason `DietDayPayload.meals` is: a backend
   *  a release behind this file sends no such key, and an empty list is a
   *  better answer than a screen that throws. */
  hours?: string[]
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
    hours: payload.hours ?? [],
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
    // Blanks dropped rather than sent: the form keeps an empty row while
    // somebody is still typing into it, and '' is not a time. Sorting and
    // de-duplicating is the server's job (`validate_hours`), so this sends
    // what was typed.
    hours: input.hours.map((hour) => hour.trim()).filter((hour) => hour !== ''),
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


/* ------------------------------------------------------------------ *
 *  Aktywność i sen (§09)
 *
 *  Real now. Until this endpoint existed both panels held their entries in
 *  component state and a reload lost them, which is why this section used to
 *  carry "empty" producers plus a pair of *sample* ones and the screen carried
 *  three separate pieces of wording admitting that nothing was stored. The
 *  samples are gone with the pretence; the empty producers stay, because they
 *  are what a panel draws while its first request is in flight.
 *
 *  BOTH ENDPOINTS ADDRESS TODAY AND NOTHING ELSE — no date travels in either
 *  direction on a write. That is what makes §09's "a day is locked once it is
 *  over" structural rather than a permission somebody can forget.
 * ------------------------------------------------------------------ */

const ACTIVITY_URL = '/api/diet/activity/'
const SLEEP_URL = '/api/diet/sleep/'

interface ActivityEntryPayload {
  id: string
  date: string
  time: string
  kind: string | null
  kind_other: string
  duration_minutes: number | null
  feeling_after: FeelingAfter | null
}

interface ActivityDayPayload {
  date: string
  /** Optional for the reason `DietDayPayload.meals` is: a backend a release
   *  behind this file sends no such key, and an empty list is a better answer
   *  than a panel that throws. */
  entries?: ActivityEntryPayload[]
  steps: number | null
}

interface SleepNightPayload {
  date: string
  fell_asleep_at: string | null
  woke_up_at: string | null
  quality: SleepQuality | null
  awakenings: number
  wake_feeling: WakeFeeling | null
}

function toActivityEntry(payload: ActivityEntryPayload): DietActivityEntry {
  return {
    id: payload.id,
    date: payload.date,
    time: payload.time,
    kind: payload.kind,
    // '' rather than null, which is what the type declares: the chip and its
    // free text are two controls and one answer, and the form needs a string
    // to put in the input.
    kindOther: payload.kind_other ?? '',
    durationMinutes: payload.duration_minutes,
    feelingAfter: payload.feeling_after,
  }
}

function toActivityDay(payload: ActivityDayPayload): DietActivityDay {
  return {
    date: payload.date,
    entries: (payload.entries ?? []).map(toActivityEntry),
    steps: payload.steps,
  }
}

function toSleepNight(payload: SleepNightPayload): DietSleepNight {
  return {
    date: payload.date,
    fellAsleepAt: payload.fell_asleep_at,
    wokeUpAt: payload.woke_up_at,
    quality: payload.quality,
    awakenings: payload.awakenings,
    wakeFeeling: payload.wake_feeling,
  }
}

/** A day nothing has been written to: no activities, no step count.
 *
 *  What a panel draws while its first request is in flight, so it has a shape
 *  rather than a branch on null — and deliberately *not* what it settles on
 *  when a request fails, which is reported as a failure. */
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
 *
 * It is also exactly what the server answers for a morning nobody has touched,
 * so the loading shape and the loaded one are the same object.
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

/** What the form has collected: an entry minus the two stamps the server adds. */
export type ActivityAnswers = Pick<
  DietActivityEntry,
  'kind' | 'kindOther' | 'durationMinutes' | 'feelingAfter'
>

/** Today's activities and step count. */
export async function fetchActivityDay(): Promise<DietActivityDay> {
  return toActivityDay(await apiRequest<ActivityDayPayload>(ACTIVITY_URL))
}

/**
 * Write one activity, and get the whole rebuilt day back.
 *
 * **NO DATE AND NO HOUR TRAVEL.** Both are stamped from the server's clock,
 * which is a change from what this file used to do and a deliberate one: the
 * stamp used to be read from the browser at save time, and before that copied
 * off a day object fixed when the route mounted — which filed an activity saved
 * at 00:10 under the previous day. One clock decides, and it is the same one
 * that decides which day every other row in this module belongs to.
 *
 * A blank answer is sent as `null` rather than `''`, the rule `toPayload` above
 * follows: the server normalises both, and two representations of "not
 * answered" on the wire is one more than the column has.
 */
export async function createActivity(
  answers: ActivityAnswers,
): Promise<DietActivityDay> {
  const typed = answers.kindOther.trim()
  return toActivityDay(
    await apiRequest<ActivityDayPayload>(ACTIVITY_URL, {
      method: 'POST',
      body: {
        kind: answers.kind,
        kind_other: typed === '' ? null : typed,
        duration_minutes: answers.durationMinutes,
        feeling_after: answers.feelingAfter,
      },
    }),
  )
}

/** Take one of today's activities back. Answers with the rebuilt day. */
export async function deleteActivity(id: string): Promise<DietActivityDay> {
  return toActivityDay(
    await apiRequest<ActivityDayPayload>(`${ACTIVITY_URL}${id}/`, {
      method: 'DELETE',
    }),
  )
}

/**
 * Set the day's step count, or clear it.
 *
 * `null` clears it, which deletes the row on the server: a row *means* a count
 * was typed, so "nobody typed one" is an absent row and "no steps taken" is a
 * row holding 0. The panel sends null for an emptied input for exactly that
 * reason.
 */
export async function setSteps(steps: number | null): Promise<DietActivityDay> {
  return toActivityDay(
    await apiRequest<ActivityDayPayload>(`${ACTIVITY_URL}steps/`, {
      method: 'PUT',
      body: { steps },
    }),
  )
}

/** The night that ended this morning — an empty shape when nobody answered. */
export async function fetchSleepNight(): Promise<DietSleepNight> {
  return toSleepNight(await apiRequest<SleepNightPayload>(SLEEP_URL))
}

/**
 * Write the night.
 *
 * PUT replaces rather than merges, which is the server's rule and this layer
 * sends the whole form to match it: an hour left out is an answer taken back,
 * not one left unchanged. The date is the server's own, so nothing here sends
 * one — only this morning's night is writable.
 */
export async function saveSleepNight(
  night: DietSleepNight,
): Promise<DietSleepNight> {
  return toSleepNight(
    await apiRequest<SleepNightPayload>(SLEEP_URL, {
      method: 'PUT',
      body: {
        fell_asleep_at: night.fellAsleepAt,
        woke_up_at: night.wokeUpAt,
        quality: night.quality,
        awakenings: night.awakenings,
        wake_feeling: night.wakeFeeling,
      },
    }),
  )
}

/* ------------------------------------------------------------------ *
 *  Raporty tygodniowe (§10)
 *
 *  Derived on the server now (`core/diet_reports.py`), which is the same move
 *  the psychotherapy module made and for the same two reasons: the "has this
 *  week ended" cutoff is read on one clock rather than on each browser's, and
 *  there is one document rather than one per reader.
 *
 *  **A WEEK HERE IS NOT A MONDAY.** Seven days counted from the patient's first
 *  entry — the client's own rule — and the day it starts on is stored server-
 *  side (`patient.diet_week_start`) so a week id cannot renumber itself. That
 *  is why nothing in this file computes a week any more: `utils/dietWeeks.ts`
 *  keeps only the labels.
 * ------------------------------------------------------------------ */

const DIET_REPORTS_URL = '/api/diet/reports/'

interface ReportMealCellPayload {
  slot: DietMealSlot
  meals: DietMealPayload[]
}

interface ReportMealRowPayload {
  date: string
  cells: ReportMealCellPayload[]
}

interface ReportMealGridPayload {
  slots: DietMealSlot[]
  rows: ReportMealRowPayload[]
}

interface ReportDayPayload {
  date: string
  meals: DietMealPayload[]
  hydration: HydrationDayTotalPayload | null
  sleep: SleepNightPayload | null
  activity: ActivityDayPayload | null
  empty: boolean
}

/** One row of "Najczęstsze emocje przy jedzeniu", as
 *  `core.diet_reports._rank_meal_emotions` sends it. */
interface ReportEmotionPayload {
  emotion: string
  meals: number
  rated_meals: number
  avg_intensity: number | null
}

interface ReportEmotionsPayload {
  meals_with_emotion: number
  rows: ReportEmotionPayload[]
}

interface ReportPayload {
  id: string
  week_start: string
  week_end: string
  range_label: string
  days: ReportDayPayload[]
  days_with_entry: number
  meal_grid: ReportMealGridPayload
  /**
   * Optional on the wire and nowhere else.
   *
   * The same defence `DietMealPayload.emotions` carries, for the same reason: a
   * browser holding this release against a server one release behind it gets a
   * report with no `emotions` key, and reading `.rows` off undefined would take
   * out the whole screen over a section that is allowed to be empty anyway.
   */
  emotions?: ReportEmotionsPayload
}

function toReportDay(payload: ReportDayPayload): DietReportDay {
  return {
    date: payload.date,
    meals: payload.meals.map(toMeal),
    hydration: payload.hydration ? toDayTotal(payload.hydration) : null,
    sleep: payload.sleep ? toSleepNight(payload.sleep) : null,
    activity: payload.activity ? toActivityDay(payload.activity) : null,
    empty: payload.empty,
  }
}

function toReportEmotions(payload: ReportEmotionsPayload | undefined): DietReportEmotions {
  return {
    mealsWithEmotion: payload?.meals_with_emotion ?? 0,
    rows: (payload?.rows ?? []).map((row) => ({
      // One of the ten, the same assertion `toMeal` makes about the chips on a
      // meal: the server writes them through a ChoiceField over
      // `core.emotions.EMOTIONS`, and `emotions.test.ts` pins that list against
      // `EmotionName` in both directions.
      emotion: row.emotion as EmotionName,
      meals: row.meals,
      ratedMeals: row.rated_meals,
      // Null stays null. A mean over nothing is not a zero, and the row renders
      // as a count alone when it is missing.
      avgIntensity: row.avg_intensity,
    })),
  }
}

function toReport(payload: ReportPayload): DietWeeklyReport {
  return {
    id: payload.id,
    weekStart: payload.week_start,
    weekEnd: payload.week_end,
    rangeLabel: payload.range_label,
    days: payload.days.map(toReportDay),
    daysWithEntry: payload.days_with_entry,
    mealGrid: {
      slots: payload.meal_grid.slots,
      rows: payload.meal_grid.rows.map((row) => ({
        date: row.date,
        cells: row.cells.map((cell) => ({
          slot: cell.slot,
          meals: cell.meals.map(toMeal),
        })),
      })),
    },
    emotions: toReportEmotions(payload.emotions),
  }
}

/** Every report the four diaries support, newest first. */
export async function fetchDietReports(): Promise<DietWeeklyReport[]> {
  const payload = await apiRequest<ReportPayload[]>(DIET_REPORTS_URL)
  return payload.map(toReport)
}

/**
 * One report by its week id.
 *
 * A week nobody wrote in and a typed-in address answer the same way — a 404 —
 * because neither tells the patient anything they can act on. The screen words
 * that as "nie znaleziono takiego raportu" rather than as a failure.
 */
export async function fetchDietReport(id: string): Promise<DietWeeklyReport> {
  return toReport(await apiRequest<ReportPayload>(`${DIET_REPORTS_URL}${id}/`))
}

/**
 * The same week as a file.
 *
 * Its own document rather than the psychotherapy one with different numbers —
 * see core/diet_report_pdf.py, which lays out the meal grid and the week. Named
 * apart on disk too (`raport-zywieniowy-…`), so a specialist downloading both
 * for one patient does not end up with two files whose names collide.
 */
export async function fetchDietReportPdf(id: string): Promise<Blob> {
  return apiDownload(`${DIET_REPORTS_URL}${encodeURIComponent(id)}/pdf/`)
}

/**
 * The report mapping, for the specialist panel's copy of these screens.
 *
 * Exported under names that say which module they belong to, because
 * `api/specialist.ts` already imports `toReport` from `api/reports.ts` — one
 * file holding both needs them told apart. Reused rather than copied for the
 * reason the psychotherapy one is: two mappings of one payload are two things
 * that can disagree about a week.
 */
export { toReport as toDietReport }
export type { ReportPayload as DietReportPayload }
