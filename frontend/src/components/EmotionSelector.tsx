import { EMOTION_COLORS, type EmotionName } from '../utils/emotions'
import type { EmotionEntry } from '../types/diaryEntry'

const EMOTION_NAMES = Object.keys(EMOTION_COLORS) as EmotionName[]

interface EmotionSelectorProps {
  selected: EmotionEntry[]
  onToggle: (emotion: EmotionName) => void
  onIntensityChange: (emotion: EmotionName, intensity: number) => void
}

function EmotionSelector({ selected, onToggle, onIntensityChange }: EmotionSelectorProps) {
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
        return (
          <div className="emotion-intensity" key={entry.emotion}>
            <div className="emotion-intensity-header">
              <span style={{ color }}>{entry.emotion}</span>
              <span className="emotion-intensity-value" style={{ color }}>
                {entry.intensity ?? 0}/10
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
