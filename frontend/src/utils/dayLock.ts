/**
 * "Editable on the day it was written, read-only afterwards" — the app's rule
 * about its own past, in one place.
 *
 * THE RULE IS STRUCTURAL, NOT A FLAG. Nothing stores "locked": an entry carries
 * the calendar day it describes, `utils/days.ts` says which day it is now, and
 * the two are compared. On the backend the same rule is expressed by there
 * being exactly one writable diary URL (`/api/diary/today/`, which can only
 * ever address today) — so a past entry is not refused, it is unreachable. The
 * diet module has no backend yet; when it gets one, it should be shaped the
 * same way, and this helper stays as what the screen uses to draw the
 * difference.
 *
 * WHY IT MATTERS ON A SCREEN THAT ONLY EVER SHOWS TODAY. A page computes "now"
 * once, when it mounts. A phone left open overnight is therefore holding a form
 * whose day has ended, and without this check it would go on offering to write
 * into it.
 *
 * **BOTH ARGUMENTS MUST NOT COME FROM THE SAME FROZEN CLOCK.** That is the trap
 * the diet module fell into: the screen fixed `today` at mount, built the day it
 * was showing from it (`loadActivityDay(today)` → `date: toIsoDate(today)`), and
 * then passed the same value back in here — so the comparison read `x === x` and
 * was true forever. The check compiled, read correctly, had tests over it, and
 * enforced nothing; the tests passed only because they mocked the loader into
 * returning a date the real one never returns. `now` therefore has to be read
 * from a live source: `hooks/useCurrentDay.ts` is what the diet panels use, and
 * it re-reads the clock on an interval and when the app comes back to the
 * foreground.
 *
 * AND A LOCK IS NOT A SUBSTITUTE FOR A CORRECT STAMP. Whatever this returns, the
 * date written *onto* an entry has to be taken from the clock at the moment of
 * saving rather than copied off the day object on screen — see
 * `newActivityEntry` in api/diet.ts. A refused save is a control that
 * misbehaved; a row filed under the wrong day is bad data in a document a
 * specialist reads.
 *
 * THE WORDING IS BORROWED, DELIBERATELY. Both strings below are the ones the
 * psychotherapy module already says about the same rule — the badge from
 * `pages/Journals.tsx` and the sentence from `pages/DiaryEntry.tsx`. A patient
 * crossing between modules must not meet two explanations of one rule.
 *
 * TODO: those two screens still hold their own copies of these literals, which
 * is exactly the drift this file exists to prevent. Moving them onto this
 * helper is a change to the psychotherapy module and was out of scope here — do
 * it the next time either screen is touched.
 */

import { toIsoDate } from './days'

/**
 * Whether an entry describing `date` ('YYYY-MM-DD') may still be changed.
 *
 * The comparison is on the local calendar day, never on an instant — the same
 * test `pages/Journals.tsx` makes to decide which row is not marked read-only.
 */
export function isEditableDay(date: string, now: Date = new Date()): boolean {
  return date === toIsoDate(now)
}

/** What a row that can no longer be changed is labelled. From pages/Journals.tsx. */
export const READ_ONLY_BADGE = 'Tylko odczyt'

/**
 * What a form that can still be changed says about its deadline. From
 * pages/DiaryEntry.tsx, where `dateLabel` is "piątek, 14 sierpnia".
 *
 * `stored` IS WHETHER THERE IS SOMEWHERE FOR THE ENTRY TO BE KEPT, and it
 * exists because the second sentence is a promise rather than a description of
 * the rule. The rule is that today is editable and a past day is not, which
 * holds on a screen with no backend just as well; "Później zostanie zapisany na
 * stałe" additionally claims the entry survives, which on /diet/activity-sleep
 * is false — nothing there reaches an endpoint and a reload loses it. Rendered
 * anyway, it sat one line under the note admitting exactly that, so the screen
 * contradicted itself in two consecutive paragraphs.
 *
 * It defaults to true because every *other* screen this helper is for does
 * store what it collects. Pass false only while a screen genuinely keeps
 * nothing, and drop the argument in the commit that gives it an endpoint.
 */
export function dayLockNotice(dateLabel: string, stored = true): string {
  const deadline = `Ten wpis możesz edytować do końca dzisiejszego dnia (${dateLabel}).`
  return stored ? `${deadline} Później zostanie zapisany na stałe.` : deadline
}
