/**
 * The diet module's weekly report, as §10 of `Makiety modułu dietetycznego`
 * defines it ("Raporty — historia i szczegół").
 *
 * TWO RULES HERE ARE DIFFERENT FROM THE PSYCHOTHERAPY MODULE'S REPORTS, and
 * both come from §10 rather than from a preference:
 *
 *   1. **The week is counted from the patient's first entry, not from Monday.**
 *      "Raport generuje się automatycznie co siedem dni, licząc od dnia
 *      pierwszego wpisu pacjentki, a nie od poniedziałku." So `anchor` is on
 *      this shape: it is the grid every week below sits on. `core/reports.py`
 *      (the psychotherapy half) groups Monday-Sunday and must not be reused.
 *   2. **The week in progress is visible**, as a card that says when it closes.
 *      "Bieżący tydzień jest widoczny jako «w toku» i domyka się o północy
 *      ostatniego dnia." The psychotherapy module leaves it out of the list
 *      entirely, which is why `inProgress` is a separate key rather than a
 *      report with a flag: a week in progress has no report, and a screen that
 *      could render it as one would be one `if` away from doing so.
 *
 * DERIVED, NEVER STORED — the same as the psychotherapy reports. Nothing writes
 * a diet report anywhere; each one is rebuilt from `diet_meal` and `hydration`
 * on every request, so no figure on a report can disagree with the diary it
 * came from. Which is also why there is no `generatedAt` on this shape and why
 * the screen says "dostępny od" rather than "wygenerowany": nothing generated
 * it, and claiming an event that never happened would be false in a document a
 * specialist reads.
 */

/** One "etykieta i wartość" line — §10's own form for a report's content.
 *
 *  Both halves are composed on the server (`core/diet_reports.py`). The
 *  psychotherapy module keeps figures on the wire and wording in the frontend,
 *  and pays for it with two definitions of the same sentence
 *  (`formatDeltaSentence` for the screen, `report_pdf.format_delta` for print).
 *  These rows are narrative Polish and are headed for a PDF too, so they are
 *  written once, in Python. `key` exists so a screen or a test can find a row
 *  without matching Polish. */
export interface DietReportRow {
  key: string
  label: string
  value: string
}

/** The week that has not ended yet — a card, never a report. */
export interface InProgressWeek {
  /** 'YYYY-MM-DD'. */
  start: string
  end: string
  /** The day at whose midnight the week closes; §10's "domknie się o północy". */
  closesOn: string
  mealCount: number
  daysWithMeals: number
}

export interface DietReport {
  /** 'week-2026-08-01' — a slug, the same convention as `/api/reports/`. */
  id: string
  start: string
  end: string
  /** The day after the week ended, i.e. when this report first existed. */
  availableFrom: string
  weekDays: number
  mealCount: number
  daysWithMeals: number
  /** In the order the server composed them; a row with no source is absent. */
  rows: DietReportRow[]
  /**
   * A direction and a value against the previous report, never an assessment.
   * Null when there is no earlier week to compare with.
   *
   * The artboard's card is titled "Zmiany od ostatniej wizyty" and this app
   * holds **no visit dates at all**, so what is actually computed is the change
   * from the previous week — see `TODO(klientka)` on the detail screen.
   */
  changeNote: string | null
  /**
   * The §10 content rows that have **no column yet**, named rather than faked.
   *
   * §10 lists six things a report should hold; four of them — emotions at a
   * meal, physical against emotional hunger, the situations behind emotional
   * eating, plus sleep and activity — come from §05's meal-context form and
   * §09's screens, none of which is built. Rendering them with an invented
   * figure is this project's worst failure mode (a made-up number in a document
   * a specialist reads), and dropping them silently would make a three-row
   * report read as a patient who wrote nothing. So they travel, and the screen
   * says in one line what the report cannot yet include.
   */
  missing: string[]
}

/** What `GET /api/diet/reports/` answers with. */
export interface DietReportSummary {
  /** The patient's first meal date — the grid every week sits on. Null for a
   *  diary nothing has been written to, in which case there is nothing to
   *  report on and `inProgress` is null too. */
  anchor: string | null
  inProgress: InProgressWeek | null
  /** Completed weeks that hold at least one meal, newest first. */
  reports: DietReport[]
}
