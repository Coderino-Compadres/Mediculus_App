import type { CrisisLine } from '../types/safetyPlan'

/**
 * Polish crisis and support lines, shown on "Plan bezpieczeństwa" whether or not
 * the patient has a plan.
 *
 * HARDCODED ON PURPOSE, AND THIS IS THE FINAL FORM. Everywhere else in this app
 * hardcoded data is a stand-in for an endpoint; not here. These numbers are
 * public, national, identical for every patient and unchanged for years, so a
 * request would buy nothing and would introduce the one thing this section must
 * never do: fail to render. A person opening this screen at 3 a.m. on a phone
 * with one bar has to see the numbers, and a constant in the bundle always does.
 *
 * TODO(weryfikacja): re-check the numbers, the hours and the cost periodically —
 * helplines get restructured, refunded, merged or closed, and the wording of what
 * is "całodobowy" changes more often than the digits do. Treat this file as
 * content with an expiry date, not as configuration: a wrong number here is worse
 * than no number.
 */

/**
 * Not a helpline, and deliberately described as one thing only. `isEmergency`
 * keeps it out of every sentence the section writes about free 24-hour support:
 * calling 112 is a different act from calling a helpline, and blurring the two
 * either wastes an emergency call or delays one.
 */
const NUMER_ALARMOWY: CrisisLine = {
  id: 'emergency-112',
  number: { dial: '112', display: '112' },
  name: 'Numer alarmowy',
  audience: 'gdy zagrożone jest życie lub zdrowie',
  availability: 'całodobowy',
  forYouth: false,
  isEmergency: true,
}

const KRYZYSOWY_TELEFON_ZAUFANIA: CrisisLine = {
  id: 'ktz-116123',
  number: { dial: '116123', display: '116 123' },
  name: 'Kryzysowy Telefon Zaufania',
  audience: 'dla osób dorosłych',
  availability: 'bezpłatny, całodobowy',
  forYouth: false,
  isEmergency: false,
}

/**
 * TODO(weryfikacja): confirm the published name and audience with the client.
 * This line is run as "Centrum Wsparcia dla Osób Dorosłych w Kryzysie
 * Psychicznym" — the "dorosłych" is part of the name, and dropping it from
 * `audience` (as this entry first did) is what made it look age-neutral and
 * turned it into the default the home banner offered to minors as well. `name`
 * is kept short for the row layout; the restriction lives in `audience`, which
 * is rendered next to it.
 */
const CENTRUM_WSPARCIA: CrisisLine = {
  id: 'centrum-wsparcia-800702222',
  number: { dial: '800702222', display: '800 70 2222' },
  name: 'Centrum Wsparcia',
  audience: 'dla osób dorosłych w kryzysie psychicznym',
  availability: 'bezpłatne, całodobowe',
  forYouth: false,
  isEmergency: false,
}

const TELEFON_ZAUFANIA_DLA_DZIECI: CrisisLine = {
  id: 'tzdim-116111',
  number: { dial: '116111', display: '116 111' },
  name: 'Telefon Zaufania dla Dzieci i Młodzieży',
  audience: 'dla osób do 18. roku życia',
  availability: 'bezpłatny, całodobowy',
  forYouth: true,
  isEmergency: false,
}

const DZIECIECY_TELEFON_ZAUFANIA_RPD: CrisisLine = {
  id: 'rpd-800121212',
  number: { dial: '800121212', display: '800 12 12 12' },
  name: 'Dziecięcy Telefon Zaufania Rzecznika Praw Dziecka',
  audience: 'dla dzieci i młodzieży',
  availability: 'bezpłatny, całodobowy',
  forYouth: true,
  isEmergency: false,
}

/**
 * The order on screen, and it is a decision rather than a sort: emergency first,
 * then the two adult lines, then the two for children and teenagers. Changing the
 * order means changing this array — nothing computes it.
 */
export const CRISIS_LINES: CrisisLine[] = [
  NUMER_ALARMOWY,
  KRYZYSOWY_TELEFON_ZAUFANIA,
  CENTRUM_WSPARCIA,
  TELEFON_ZAUFANIA_DLA_DZIECI,
  DZIECIECY_TELEFON_ZAUFANIA_RPD,
]

/**
 * The line the home screen's crisis banner names, chosen by who is reading it.
 *
 * ONE SOURCE FOR THE NUMBER. `pages/Home.tsx` used to carry its own
 * `CRISIS_SUPPORT_PHONE` constant — empty, with a TODO to fill in later — which
 * would have left the app holding two independent copies of a crisis number: the
 * kind of pair that survives exactly one correction before one of them is stale.
 * The banner reads this instead, so the number it offers is by construction one
 * of the numbers "Plan bezpieczeństwa" lists.
 *
 * WHY THIS BRANCHES AT ALL. It first shipped as a single constant, Centrum
 * Wsparcia, on the reasoning that it was the one line specific to psychological
 * crisis without being addressed to an age group. That reasoning was wrong:
 * that line is published for adults (see the note on it above), so with 116 123
 * adult and 116 111 for under-18s, NONE of the five is age-neutral. A single
 * default therefore had to be wrong for one audience or the other — and the app
 * has both, since `minor_patient` is an account type at registration. Handing a
 * 14-year-old an adult line is precisely the failure `forYouth` and its badge
 * exist to prevent, so the banner asks who it is talking to.
 *
 * 112 is not a candidate either way: the banner fires on a week of raised
 * stress, which is not an emergency, and telling somebody it is would be both
 * wrong and frightening.
 */
export const ADULT_SUPPORT_LINE: CrisisLine = CENTRUM_WSPARCIA
export const YOUTH_SUPPORT_LINE: CrisisLine = TELEFON_ZAUFANIA_DLA_DZIECI

/**
 * `isChild === true` rather than a truthiness test, mirroring `needsGuardianLink`
 * in `src/api/auth.ts` character for character — `is_child` is nullable, and the
 * rest of the app already reads a NULL there as "not a minor" (a truthiness test
 * would flip the meaning of every legacy row at once). An account whose age the
 * app genuinely does not know is one tap from the full list either way: the
 * banner links straight to "Plan bezpieczeństwa", where all five lines are shown
 * with their audiences.
 */
export function crisisSupportLine(isChild: boolean | null): CrisisLine {
  return isChild === true ? YOUTH_SUPPORT_LINE : ADULT_SUPPORT_LINE
}
