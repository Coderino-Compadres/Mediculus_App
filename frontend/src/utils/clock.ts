/**
 * The clock the whole app reads, in one place.
 *
 * Polish writes the time of day as 16:20 — there is no "4:20 pm" in Polish, and
 * a patient reading their own diary should never meet one. Most of the app gets
 * this for free: every time the server sends is already a string built by
 * `strftime('%H:%M')` (`core/meals.py`, `core/activity.py`, `core/sleep.py`,
 * `core/supplements.py`), so it arrives in 24-hour form and is printed as it
 * came. Only the few timestamps the browser formats itself pass through here.
 *
 * WHY `hourCycle` AND NOT `hour12: false`. They are not the same request:
 * `hour12: false` selects the h24 cycle in several engines, where midnight is
 * written "24:00" and the hour after it "24:37" — which is not what anybody
 * writes down, and is a real difference on a screen that shows meals eaten late
 * at night. `h23` is the cycle Polish actually uses: 00:00 through 23:59.
 *
 * WHY IT IS STATED AT ALL, given that 'pl-PL' already resolves to h23: because
 * nothing in the code said so. A locale's default hour cycle is data in CLDR,
 * not a promise of this app's, and "the time is 24-hour everywhere" is a rule
 * worth writing down where it can be read and tested rather than inferred from
 * a locale tag. `utils/clock.test.ts` pins it.
 */

/** The named options, exported so a caller that needs `Intl.DateTimeFormat`
 *  directly asks for the same clock rather than spelling it again. */
export const CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}

/**
 * "16:20" — a moment as the time of day, in the reader's own zone.
 *
 * Returns null for a missing or unparseable value rather than "Invalid Date",
 * so a caller can leave the time out instead of printing nonsense next to a
 * real entry. Both callers do exactly that.
 */
export function clockTime(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const moment = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(moment.getTime())) return null
  return moment.toLocaleTimeString('pl-PL', CLOCK_FORMAT)
}
