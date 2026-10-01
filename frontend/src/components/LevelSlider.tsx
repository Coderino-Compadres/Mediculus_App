interface LevelSliderProps {
  id: string
  label: string
  lowLabel: string
  highLabel: string
  /** `null` = not answered yet; it renders at 0 but says so instead of "0/10". */
  value: number | null
  onChange: (value: number) => void
  /** Given, a "Wyczyść" button takes an answer back to `null`. */
  onClear?: () => void
  /** Highlights the value in the error color once it crosses this threshold, e.g. the stress alert. */
  alertThreshold?: number
}

const UNRATED = 'nie podano'

function LevelSlider({ id, label, lowLabel, highLabel, value, onChange, onClear, alertThreshold }: LevelSliderProps) {
  const isAlert = alertThreshold !== undefined && value !== null && value >= alertThreshold
  const valueClass = isAlert
    ? 'level-slider-value level-slider-value-alert'
    : value === null
      ? 'level-slider-value level-slider-value-unrated'
      : 'level-slider-value'

  return (
    <div className="level-slider">
      <div className="level-slider-header">
        <label htmlFor={id}>{label}</label>
        <span className={valueClass}>
          {value === null ? UNRATED : `${value}/10`}
          {/* WCAG 1.4.1, the same fix as EmotionSelector: the alert was a
              colour on its own. No caller passes `alertThreshold` today — the
              stress alert moved to the emotion chip — but the branch is live
              code, and one that fails a criterion silently is worse than one
              that fails it visibly. */}
          {isAlert && <span className="level-slider-flag"> · wysokie</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value ?? 0}
        onChange={(event) => onChange(Number(event.target.value))}
        // An unanswered slider already sits at 0, and a range input fires no
        // change for the value it shows — so tapping 0 would record nothing.
        // A click (pointer or keyboard release) on an unanswered slider counts.
        onClick={(event) => {
          if (value === null) onChange(Number(event.currentTarget.value))
        }}
        onKeyUp={(event) => {
          if (value === null) onChange(Number(event.currentTarget.value))
        }}
        className={isAlert ? 'level-slider-input level-slider-input-alert' : 'level-slider-input'}
      />
      <div className="level-slider-ends">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      {onClear && value !== null && (
        <button type="button" className="level-slider-clear" onClick={onClear}>
          Wyczyść odpowiedź
        </button>
      )}
    </div>
  )
}

export default LevelSlider
