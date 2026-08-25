interface LevelSliderProps {
  id: string
  label: string
  lowLabel: string
  highLabel: string
  value: number
  onChange: (value: number) => void
  /** Highlights the value in the error color once it crosses this threshold, e.g. the stress alert. */
  alertThreshold?: number
}

function LevelSlider({ id, label, lowLabel, highLabel, value, onChange, alertThreshold }: LevelSliderProps) {
  const isAlert = alertThreshold !== undefined && value >= alertThreshold

  return (
    <div className="level-slider">
      <div className="level-slider-header">
        <label htmlFor={id}>{label}</label>
        <span className={isAlert ? 'level-slider-value level-slider-value-alert' : 'level-slider-value'}>
          {value}/10
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={isAlert ? 'level-slider-input level-slider-input-alert' : 'level-slider-input'}
      />
      <div className="level-slider-ends">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  )
}

export default LevelSlider
