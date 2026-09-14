import { EMOTION_COLORS, type EmotionName } from '../utils/emotions'
import type { EmotionEntry } from '../types/diaryEntry'
import './emotionSelector.css'

const EMOTION_NAMES = Object.keys(EMOTION_COLORS) as EmotionName[]

/** What a chip reads when it was picked and the slider was never moved.
 *
 *  Not "0/10", because those are two different answers and one of this
 *  component's two callers can store both: `diet_meal_emotion.intensity` is
 *  nullable, so the diet form sends null for an untouched slider (CLAUDE.md's
 *  rule) rather than a number nobody chose. The psychotherapy form cannot —
 *  `mood_scale` has no room for the distinction — so it sends 0 on picking and
 *  never reaches this string.
 *
 *  "nie podano" rather than the more natural "bez oceny", because the diet
 *  form's own sweep refuses the stem `ocen` anywhere on the screen: that module
 *  must never look like it is *judging* a meal, and a guard that has to reason
 *  about which noun a word belongs to is a guard that stops holding. */
const UNRATED = 'nie podano'

interface EmotionSelectorProps {
  selected: EmotionEntry[]
  onToggle: (emotion: EmotionName) => void
  onIntensityChange: (emotion: EmotionName, intensity: number) => void
  /** Per-emotion values at or above which the reading is shown in the error
   *  color, e.g. the confirmed stress alarm from US-PT-13. */
  alertThresholds?: Partial<Record<EmotionName, number>>
}

function EmotionSelector({
  selected,
  onToggle,
  onIntensityChange,
  alertThresholds,
}: EmotionSelectorProps) {
  return (
    <div className="emotion-selector">
      <div className="emotion-chip-row">
        {EMOTION_NAMES.map((emotion) => {
          const entry = selected.find((item) => item.emotion === emotion)
          const isSelected = Boolean(entry)
          const color = EMOTION_COLORS[emotion]
          return (
            <button
              key={emotion}
              type="button"
              className={isSelected ? 'emotion-chip emotion-chip-selected' : 'emotion-chip'}
              style={
                isSelected
                  ? { backgroundColor: color, borderColor: color }
                  : { borderColor: color, color }
              }
              onClick={() => onToggle(emotion)}
            >
              {emotion}
            </button>
          )
        })}
      </div>

      {selected.map((entry) => {
        const color = EMOTION_COLORS[entry.emotion]
        const threshold = alertThresholds?.[entry.emotion]
        // `entry.intensity ?? 0` would have flagged an *unrated* chip on a
        // threshold of 0, and read an unanswered question as a low answer.
        // Nothing is compared until there is a number to compare.
        const isAlert =
          threshold !== undefined && entry.intensity !== null && entry.intensity >= threshold
        const unrated = entry.intensity === null
        return (
          <div className="emotion-intensity" key={entry.emotion}>
            <div className="emotion-intensity-header">
              <span style={{ color }}>{entry.emotion}</span>
              <span
                className={
                  isAlert
                    ? 'emotion-intensity-value emotion-intensity-value-alert'
                    : unrated
                      ? 'emotion-intensity-value emotion-intensity-unrated'
                      : 'emotion-intensity-value'
                }
                style={isAlert ? undefined : { color }}
              >
                {unrated ? UNRATED : `${entry.intensity}/10`}
                {/* WCAG 1.4.1. The alert used to be `color: var(--color-error)`
                    and nothing else, so a reader who cannot tell the red from
                    the emotion's own hue — or who is using a screen reader —
                    saw "8/10" and never learned the app had flagged it. The
                    word carries the same meaning without the colour, and being
                    real text it reaches assistive tech for free. */}
                {isAlert && <span className="emotion-intensity-flag"> · wysokie</span>}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              // The slider has no empty position, so an unrated chip renders at
              // 0 — but moving it is what *makes* it a number, and until then
              // the reading beside it says so rather than claiming a number.
              //
              // ONE CONSEQUENCE, AND IT IS ACCEPTED: a rating of exactly 0 on a
              // chip that is still unrated cannot be given in a single tap,
              // because a range input fires nothing when its value does not
              // change. Nudging the slider and coming back records it. Worth
              // the trade — "picked, and it was not strong at all" is what
              // an unrated chip already reads as, while a 0 written by the form
              // itself is the answer nobody gave that the diary's `mood_scale`
              // is stuck with.
              value={entry.intensity ?? 0}
              onChange={(event) => onIntensityChange(entry.emotion, Number(event.target.value))}
              className="emotion-intensity-input"
              style={{ accentColor: color }}
              aria-label={`Natężenie: ${entry.emotion}`}
            />
          </div>
        )
      })}
    </div>
  )
}

export default EmotionSelector
