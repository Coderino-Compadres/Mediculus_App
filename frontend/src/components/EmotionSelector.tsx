import { EMOTION_COLORS, type EmotionName } from '../utils/emotions'
import type { EmotionEntry } from '../types/diaryEntry'

const EMOTION_NAMES = Object.keys(EMOTION_COLORS) as EmotionName[]

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
        const isAlert = threshold !== undefined && (entry.intensity ?? 0) >= threshold
        return (
          <div className="emotion-intensity" key={entry.emotion}>
            <div className="emotion-intensity-header">
              <span style={{ color }}>{entry.emotion}</span>
              <span
                className={
                  isAlert ? 'emotion-intensity-value emotion-intensity-value-alert' : 'emotion-intensity-value'
                }
                style={isAlert ? undefined : { color }}
              >
                {entry.intensity ?? 0}/10
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
