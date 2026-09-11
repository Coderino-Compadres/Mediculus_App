import { useState } from 'react'
import Pagination from './Pagination'
import Stepper from './Stepper'
import { loadActivityDay, newActivityEntry } from '../api/diet'
import { useCurrentDay } from '../hooks/useCurrentDay'
import { usePagination } from '../hooks/usePagination'
import { fromIsoDate } from '../utils/days'
import {
  ACTIVITY_DURATION_DEFAULT,
  ACTIVITY_DURATION_MAX,
  ACTIVITY_DURATION_STEP,
  ACTIVITY_KINDS,
  ACTIVITY_KIND_OTHER,
  FEELING_AFTER_OPTIONS,
  activityKindLabel,
  feelingAfterLabel,
  formatDurationMinutes,
} from '../utils/activity'
import { READ_ONLY_BADGE, dayLockNotice, isEditableDay } from '../utils/dayLock'
import type { FeelingAfter } from '../utils/activity'
import type { DietActivityDay, DietActivityEntry } from '../types/diet'

/**
 * "Aktywność" — the first of the two panels on /diet/activity-sleep.
 *
 * WHAT THE SCREEN ASKS, and the whole of it: what the activity was, how long it
 * lasted, and how the person felt afterwards. Plus a step count, typed by hand.
 * There is no intensity, no effort rating, no pace, no calorie figure, no daily
 * target, no progress bar, no comparison with yesterday, no streak and no
 * congratulation — and none of those is missing by accident. The module records
 * what somebody chose to write down; anything a wearable would answer is out of
 * the project's scope, and anything that grades the day is a judgement this
 * card is not entitled to make.
 *
 * SAMOPOCZUCIE PO IS NOT INTENSITY. The three chips compare how the person felt
 * after the activity with how they felt before it — the same question the meal
 * form asks about eating. The mockup's own design note is why the scale starts
 * at "Gorsze" rather than at neutral: for part of this module's patients
 * movement can be a burden, and that answer has to be exactly as easy to give
 * as the positive one.
 *
 * NOTHING BLOCKS A SAVE, the module's rule everywhere. An activity written with
 * an hour and nothing else is an entry, not an error — see `MEAL` handling in
 * pages/DietJournals.tsx for the same decision on the other screen.
 */

/** What the add-form holds between saves. Separate from the stored entries, so
 *  clearing it after a save cannot disturb the list. */
interface ActivityDraft {
  kind: string | null
  kindOther: string
  /**
   * Null until the control is actually moved.
   *
   * The stepper *renders* `ACTIVITY_DURATION_DEFAULT`, but an untouched control
   * is not an answer — the same rule `emptyDraft` in pages/DiaryEntry.tsx
   * learned the hard way, where sliders starting at 0 wrote "no energy, no
   * tension" for every patient who only answered the mood tile. The edge it
   * leaves behind is real and pinned by a test: recording exactly 30 minutes
   * takes moving the control off 30 and back.
   */
  durationMinutes: number | null
  feelingAfter: FeelingAfter | null
}

const EMPTY_DRAFT: ActivityDraft = {
  kind: null,
  kindOther: '',
  durationMinutes: null,
  feelingAfter: null,
}

/** Steps are copied off a phone, so six digits is already generous; the cap is
 *  here to stop a stray paste from breaking the row rather than to judge a
 *  number. */
const MAX_STEP_DIGITS = 6

function ActivityRow({ entry, editable }: { entry: DietActivityEntry; editable: boolean }) {
  const kind = activityKindLabel(entry.kind, entry.kindOther)
  const duration =
    entry.durationMinutes === null ? null : formatDurationMinutes(entry.durationMinutes)
  const title = [kind, duration].filter(Boolean).join(' · ')
  const feeling = feelingAfterLabel(entry.feelingAfter)

  return (
    <li className="diet-as-entry">
      <span className="diet-as-entry-time">{entry.time}</span>
      <div className="diet-as-entry-body">
        {/* An activity that answered neither question is still an activity that
            happened — said plainly rather than left as a blank row, the same
            choice DietJournals makes for a meal saved without a description. */}
        <p className={title ? 'diet-as-entry-title' : 'diet-as-entry-title-empty'}>
          {title || 'Zapisana bez szczegółów.'}
        </p>
        {feeling && (
          <p className="diet-as-entry-meta">Samopoczucie po: {feeling.toLowerCase()}</p>
        )}
      </div>
      {!editable && <span className="diet-as-readonly-badge">{READ_ONLY_BADGE}</span>}
    </li>
  )
}

function DietActivityPanel({ today }: { today: Date }) {
  const [day, setDay] = useState<DietActivityDay>(() => loadActivityDay(today))
  const [draft, setDraft] = useState<ActivityDraft>(EMPTY_DRAFT)

  /**
   * Whether this day may still be written to.
   *
   * The app's rule about its own past — `utils/dayLock.ts` compares the day the
   * data describes with the calendar day it is now, exactly as
   * pages/Journals.tsx does.
   *
   * THE SECOND ARGUMENT COMES FROM `useCurrentDay()`, NOT FROM `today`, and that
   * is the whole point of the check. `today` is fixed when the route mounts and
   * `loadActivityDay(today)` derives `day.date` from it, so comparing the two
   * asked `x === x` and was true forever: a form opened at 23:55 went on
   * offering to write into Tuesday at 00:10 on Wednesday. The live day is what
   * makes this a rule rather than a decoration.
   */
  const currentDay = useCurrentDay()
  const editable = isEditableDay(day.date, fromIsoDate(currentDay))

  /**
   * The day's activities, seven a page, like every other list in the app.
   *
   * The weakest case for it in the module and included for consistency rather
   * than from pressure on the data: nothing here is stored, so a reload empties
   * the list and a day rarely holds more than a handful of entries. It costs
   * one `?page=`, which is free on this screen — the sleep panel beside it has
   * no list, and the two tabs are component state rather than a query
   * parameter. If the sleep panel ever grows one, the two cannot share this.
   */
  const pages = usePagination(day.entries)

  /** Taken from the day being edited rather than from `today`, so the deadline
   *  in the notice cannot name a different day from the data under it. */
  const dateLabel = fromIsoDate(day.date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  function toggleKind(kind: string) {
    // Single choice, and pressing the chosen chip again takes the answer back —
    // the module has no required fields, so "I changed my mind and would rather
    // not say" has to be reachable from the control itself.
    setDraft((current) => ({
      ...current,
      kind: current.kind === kind ? null : kind,
      kindOther: kind === ACTIVITY_KIND_OTHER && current.kind !== kind ? current.kindOther : '',
    }))
  }

  function saveActivity() {
    /**
     * The date and the hour are stamped from the clock inside
     * `newActivityEntry`, not copied off `day.date`.
     *
     * `day.date` was fixed when the route mounted, so an activity saved at 00:10
     * used to be filed under the previous day — a row entering the database
     * attributed to a day it did not happen on, which then feeds a specialist's
     * reading of the week. The lock above is what stops such a save; this is
     * what keeps the save correct even if the lock is ever wrong again.
     */
    const entry = newActivityEntry(draft)
    // Newest first, the order every list in this app uses. Nothing is sent
    // anywhere: when `POST /api/diet/activity/` exists, this is the one place
    // that changes, and it changes in api/diet.ts rather than here.
    setDay((current) => ({ ...current, entries: [entry, ...current.entries] }))
    // Newest first, so what was just written is on page one.
    pages.reset()
    setDraft(EMPTY_DRAFT)
  }

  function setSteps(typed: string) {
    const digits = typed.replace(/\D/g, '').slice(0, MAX_STEP_DIGITS)
    // '' is null, not 0: nobody typing a count and somebody who took no steps
    // are different claims, and only the first is one this screen can make.
    setDay((current) => ({ ...current, steps: digits === '' ? null : Number(digits) }))
  }

  return (
    <div className="diet-as-panel">
      {editable ? (
        /* `stored: false` — the deadline is true here, the promise that the
           entry is then kept for good is not. See utils/dayLock.ts. */
        <p className="diet-as-lock">{dayLockNotice(dateLabel, false)}</p>
      ) : (
        /* The date is on the badge's row rather than left to the header, which
           says which day it is *now* — a locked panel is showing a different
           one, and that is exactly the pair a reader has to be able to tell
           apart. No new sentence: the badge is the app's own word for this and
           the date says which day it applies to. */
        <p className="diet-as-lock">
          <span className="diet-as-readonly-badge">{READ_ONLY_BADGE}</span> {dateLabel}
        </p>
      )}

      <section className="diet-as-card" aria-labelledby="activity-new-heading">
        {/* "dzisiaj" only while it *is* today. Once the day has ended the panel
            is showing somebody else's day — yesterday's — and a heading naming
            it "dzisiaj" over read-only rows would be a plain falsehood. */}
        <h2 id="activity-new-heading">{editable ? 'Aktywność dzisiaj' : 'Aktywność'}</h2>

        <div
          className="diet-as-chips"
          role="group"
          aria-labelledby="activity-kind-label"
        >
          <span className="diet-as-group-label" id="activity-kind-label">
            Rodzaj
          </span>
          <div className="diet-as-chip-row">
            {[...ACTIVITY_KINDS, ACTIVITY_KIND_OTHER].map((kind) => (
              <button
                key={kind}
                type="button"
                className={
                  draft.kind === kind ? 'diet-as-chip diet-as-chip-selected' : 'diet-as-chip'
                }
                aria-pressed={draft.kind === kind}
                disabled={!editable}
                onClick={() => toggleKind(kind)}
              >
                {kind}
              </button>
            ))}
          </div>
        </div>

        {/* Revealed by the chip rather than always on screen: a text box under
            six chips reads as a seventh question. The chip and this field are
            one answer — see activityKindLabel. */}
        {draft.kind === ACTIVITY_KIND_OTHER && (
          <div className="diet-as-field">
            <label htmlFor="activity-kind-other">Jaka aktywność?</label>
            <input
              id="activity-kind-other"
              type="text"
              value={draft.kindOther}
              readOnly={!editable}
              onChange={(event) =>
                setDraft((current) => ({ ...current, kindOther: event.target.value }))
              }
            />
          </div>
        )}

        <div className="diet-as-duration-field">
          <Stepper
            id="activity-duration"
            label="Czas trwania"
            value={draft.durationMinutes ?? ACTIVITY_DURATION_DEFAULT}
            onChange={(durationMinutes) => setDraft((current) => ({ ...current, durationMinutes }))}
            step={ACTIVITY_DURATION_STEP}
            min={ACTIVITY_DURATION_STEP}
            max={ACTIVITY_DURATION_MAX}
            formatValue={formatDurationMinutes}
            disabled={!editable}
          />
          {/* The way back to "unanswered", which every other control on this
              form has and the stepper did not: a chip deselects, the scale
              deselects, but one accidental "+" used to record 35 min for good.
              Shown only once there is an answer to withdraw, so the form is not
              carrying a control for a state it is already in. */}
          {draft.durationMinutes !== null && editable && (
            <button
              type="button"
              className="diet-as-quiet-button"
              onClick={() => setDraft((current) => ({ ...current, durationMinutes: null }))}
            >
              Nie podaję czasu
            </button>
          )}
        </div>

        <div className="diet-as-chips" role="group" aria-labelledby="activity-feeling-label">
          <span className="diet-as-group-label" id="activity-feeling-label">
            Samopoczucie po
          </span>
          <div className="diet-as-chip-row">
            {FEELING_AFTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  draft.feelingAfter === option.value
                    ? 'diet-as-chip diet-as-chip-selected'
                    : 'diet-as-chip'
                }
                aria-pressed={draft.feelingAfter === option.value}
                disabled={!editable}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    feelingAfter: current.feelingAfter === option.value ? null : option.value,
                  }))
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="diet-as-submit"
          disabled={!editable}
          onClick={saveActivity}
        >
          Zapisz aktywność
        </button>
      </section>

      <section className="diet-as-card" aria-labelledby="activity-steps-heading">
        <h2 id="activity-steps-heading">Kroki</h2>
        <div className="diet-as-field diet-as-field-inline">
          <label htmlFor="activity-steps">Liczba kroków</label>
          <input
            id="activity-steps"
            type="text"
            inputMode="numeric"
            className="diet-as-steps-input"
            value={day.steps === null ? '' : String(day.steps)}
            readOnly={!editable}
            aria-describedby="activity-steps-hint"
            onChange={(event) => setSteps(event.target.value)}
          />
        </div>
        {/* The mockup's own words. Nothing next to this number compares it with
            anything: no daily goal, no progress bar, no "wczoraj". */}
        <p className="diet-as-hint" id="activity-steps-hint">
          Wpisujesz ręcznie, kiedy chcesz.
        </p>
      </section>

      <section className="diet-as-card" aria-labelledby="activity-today-heading">
        <h2 id="activity-today-heading">{editable ? 'Zapisane dzisiaj' : 'Zapisane'}</h2>
        {day.entries.length === 0 ? (
          /* A quiet sentence rather than an empty card: nothing written yet is
             the ordinary state of a day before it has happened, and a blank
             card reads as something that failed to load. */
          <p className="diet-as-empty">
            Nic tu jeszcze nie ma. Aktywność możesz dopisać o dowolnej porze dnia — także
            kilka razy.
          </p>
        ) : (
          <>
            <ul className="diet-as-entries">
              {pages.items.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} editable={editable} />
              ))}
            </ul>
            <Pagination
              page={pages.page}
              pageCount={pages.pageCount}
              from={pages.from}
              to={pages.to}
              total={pages.total}
              onChange={pages.goTo}
              unit="wpisów"
            />
          </>
        )}
      </section>
    </div>
  )
}

export default DietActivityPanel
