import { useState } from 'react'
import Stepper from './Stepper'
import { loadSleepNight } from '../api/diet'
import { useCurrentDay } from '../hooks/useCurrentDay'
import { fromIsoDate } from '../utils/days'
import {
  SLEEP_QUALITY_VALUES,
  WAKE_FEELING_OPTIONS,
  formatSleepDuration,
  nightLabel,
  sleepDurationMinutes,
  sleepHoursCollide,
} from '../utils/sleep'
import { READ_ONLY_BADGE, dayLockNotice, isEditableDay } from '../utils/dayLock'
import type { DietSleepNight } from '../types/diet'

/**
 * "Sen" — the second panel on /diet/activity-sleep.
 *
 * WHICH NIGHT THIS IS. The entry describes the night that *ended* this morning:
 * filled in on Friday, it is the night from Thursday to Friday, and it carries
 * Friday's date. The rule is argued at length in `utils/sleep.ts` and repeated
 * on the field in `types/diet.ts`, because nothing in the data itself says it —
 * a row holding 23:40 and 06:50 reads equally well as either day, and the two
 * answers put the night in different weeks.
 *
 * FIVE FIELDS AND ONE CALCULATION. Two hours, a 1-5 quality, a count of
 * awakenings, and how the morning felt. The length of the night is derived from
 * the two hours and is the only value this module computes anywhere — there is
 * no sleep score, no weekly average, no chart of the last seven nights (the
 * mockup's other variant draws one) and nothing relating sleep to meals or to
 * mood. That last one is a specialist's reading and belongs to the analysis
 * screen, not to a card on the form that collects it.
 */

function DietSleepPanel({ today }: { today: Date }) {
  /**
   * What has been written down, and what is on the form.
   *
   * Two states rather than one because this panel has a save button: the length
   * has to recompute as the hours are typed (that is the point of the card),
   * but typing an hour is not yet an answer. Compared by value the way
   * pages/DiaryEntry.tsx does it, so the confirmation clears again the moment
   * anything is edited.
   */
  const [stored, setStored] = useState<DietSleepNight>(() => loadSleepNight(today))
  const [draft, setDraft] = useState<DietSleepNight>(stored)
  const [saved, setSaved] = useState(false)

  /**
   * The same day lock as the activity panel and as pages/Journals.tsx — see
   * utils/dayLock.ts. A night whose morning has passed cannot be rewritten.
   *
   * Compared against `useCurrentDay()` rather than against `today`: `today` is
   * fixed when the route mounts and `loadSleepNight(today)` derives `date` from
   * it, so the old comparison was `x === x` and never fired.
   */
  const currentDay = useCurrentDay()
  const editable = isEditableDay(stored.date, fromIsoDate(currentDay))

  const duration = sleepDurationMinutes(draft.fellAsleepAt, draft.wokeUpAt)
  /** Two hours that read the same. Told apart from "nothing filled in yet"
   *  because the two silences mean different things — see utils/sleep.ts. */
  const collide = sleepHoursCollide(draft.fellAsleepAt, draft.wokeUpAt)

  /** From the night being edited rather than from `today`, so the deadline in
   *  the notice cannot name a different day from the data under it. */
  const dateLabel = fromIsoDate(stored.date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  function edit(change: Partial<DietSleepNight>) {
    setDraft((current) => ({ ...current, ...change }))
    setSaved(false)
  }

  /** '' from an emptied time input is "unanswered", not midnight. */
  function editTime(field: 'fellAsleepAt' | 'wokeUpAt', typed: string) {
    edit({ [field]: typed === '' ? null : typed })
  }

  function saveNight() {
    // Nothing leaves the browser: there is no `PUT /api/diet/sleep/`. When
    // there is, this becomes one call in api/diet.ts and this panel does not
    // move.
    setStored(draft)
    setSaved(true)
  }

  return (
    <div className="diet-as-panel">
      {editable ? (
        /* `stored: false` — the deadline is true here, the promise that the
           entry is then kept for good is not. See utils/dayLock.ts. */
        <p className="diet-as-lock">{dayLockNotice(dateLabel, false)}</p>
      ) : (
        /* Which night is locked, named on the badge's own row. The header says
           which night it is *now*; a locked panel is showing an earlier one, and
           that is exactly the pair a reader has to be able to tell apart. */
        <p className="diet-as-lock">
          <span className="diet-as-readonly-badge">{READ_ONLY_BADGE}</span>{' '}
          {nightLabel(fromIsoDate(stored.date))}
        </p>
      )}

      {/* The one line on these two screens that has to address the reader in
          the past tense, so it carries both forms — feminine first with "lub",
          the diet module's own convention (see pages/DietJournals.tsx).

          Only while the night is today's: "obudziłaś lub obudziłeś się dzisiaj
          rano" is a false statement about a night from two days ago, which is
          what the panel is showing once the lock has fired. */}
      {editable && (
        <p className="diet-as-intro">
          Opisujesz noc, która właśnie minęła — tę, po której obudziłaś lub obudziłeś się
          dzisiaj rano.
        </p>
      )}

      <section className="diet-as-card" aria-labelledby="sleep-hours-heading">
        <h2 id="sleep-hours-heading">Godziny</h2>

        <div className="diet-as-hours">
          <div className="diet-as-field">
            <label htmlFor="sleep-fell-asleep">Zaśnięcie</label>
            <input
              id="sleep-fell-asleep"
              type="time"
              className="diet-as-time-input"
              value={draft.fellAsleepAt ?? ''}
              readOnly={!editable}
              onChange={(event) => editTime('fellAsleepAt', event.target.value)}
            />
          </div>
          <div className="diet-as-field">
            <label htmlFor="sleep-woke-up">Przebudzenie</label>
            <input
              id="sleep-woke-up"
              type="time"
              className="diet-as-time-input"
              value={draft.wokeUpAt ?? ''}
              readOnly={!editable}
              onChange={(event) => editTime('wokeUpAt', event.target.value)}
            />
          </div>
        </div>

        {/* The module's only computed value, on the lavender panel the mockup
            gives it, directly under the two fields it is computed from.
            `role="status"` because it changes as those fields are typed without
            either of them being the thing that changed — which is also what
            reads the correction below out loud the moment the hours collide.

            Three states, and each silence is worded for its own reason. A night
            with only one hour shows no figure rather than a zero, the same rule
            the diary applies to an untouched slider. Two identical hours are a
            mistyped digit rather than a day-long sleep, so they ask for a
            correction — plainly, without the word "błąd" and without stopping
            anything: the entry saves either way, like every other field in this
            module. */}
        <p className="diet-as-duration" role="status">
          {duration !== null ? (
            <>
              <span className="diet-as-duration-label">Długość snu</span>
              <span className="diet-as-duration-value">{formatSleepDuration(duration)}</span>
            </>
          ) : collide ? (
            <span className="diet-as-duration-note">
              Obie godziny są takie same, więc długość snu się nie policzy. Popraw jedną z
              nich, kiedy będzie okazja — wpis możesz zapisać tak czy inaczej.
            </span>
          ) : (
            <span className="diet-as-duration-empty">
              Długość snu policzy się, kiedy będą obie godziny.
            </span>
          )}
        </p>
      </section>

      <section className="diet-as-card" aria-labelledby="sleep-quality-heading">
        <h2 id="sleep-quality-heading">Jakość snu</h2>

        <div className="diet-as-chips" role="group" aria-labelledby="sleep-quality-label">
          <span className="diet-as-group-label" id="sleep-quality-label">
            Jakość snu w skali 1-5
          </span>
          <div className="diet-as-chip-row">
            {SLEEP_QUALITY_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={
                  draft.quality === value
                    ? 'diet-as-scale-button diet-as-chip-selected'
                    : 'diet-as-scale-button'
                }
                // The visible label is a bare digit, which on its own tells a
                // screen reader nothing about what it grades.
                aria-label={`Jakość snu: ${value} z 5`}
                aria-pressed={draft.quality === value}
                disabled={!editable}
                onClick={() => edit({ quality: draft.quality === value ? null : value })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <Stepper
          id="sleep-awakenings"
          label="Przebudzenia w nocy"
          value={draft.awakenings}
          onChange={(awakenings) => edit({ awakenings })}
          min={0}
          disabled={!editable}
        />

        <div className="diet-as-chips" role="group" aria-labelledby="sleep-wake-label">
          <span className="diet-as-group-label" id="sleep-wake-label">
            Po przebudzeniu
          </span>
          <div className="diet-as-chip-row">
            {WAKE_FEELING_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  draft.wakeFeeling === option.value
                    ? 'diet-as-chip diet-as-chip-selected'
                    : 'diet-as-chip'
                }
                aria-pressed={draft.wakeFeeling === option.value}
                disabled={!editable}
                onClick={() =>
                  edit({
                    wakeFeeling: draft.wakeFeeling === option.value ? null : option.value,
                  })
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="diet-as-submit" disabled={!editable} onClick={saveNight}>
          Zapisz sen
        </button>

        {/* Says where the entry went, because `role="status"` is announced on
            its own: a screen reader hears this sentence without the note at the
            top of the page, and a bare "Zapisano." would then be the one thing
            on the screen actively claiming a save that did not happen. */}
        {saved && (
          <p className="diet-as-saved" role="status">
            Zapisano — na razie tylko na tej karcie.
          </p>
        )}
      </section>
    </div>
  )
}

export default DietSleepPanel
